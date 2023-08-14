/**
* @copyright 2018 - Max Bebök
* @author Max Bebök
* @license GNU-GPLv3 - see the "LICENSE" file in the root directory
*/

const SARC = require("sarc-lib");

const electron = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const swal = require('sweetalert2');
const Filter = requireGlobal("lib/filter.js");
const Notify = requireGlobal("lib/notify/notify.js");
const String_Table = requireGlobal("lib/string_table/string_table.js");

const { dialog } = electron.remote;
const BrowserWindow = electron.remote.BrowserWindow;

const checkRenderer = require("./../../lib/3d_renderer/check");
const App_Base = require("./../base.js");

const BYAML = require("byaml-lib");
const BXML = requireGlobal("lib/bxml/bxml");

// find node with name "Folder" in modelData recursively
function findFolder(obj, keyname) {
    for (let key in obj) {
        if (key === keyname) {
            return obj[key];
        } else if (typeof obj[key] === "object") {
            let result = findFolder(obj[key], keyname);
            if (result !== undefined) {
                return result;
            }
        }
    }
}

module.exports = class App extends App_Base {
    constructor(window, args) {
        super(window, args);
        var that = this;

        let appButtons = this.node.querySelectorAll(".button-open-app");

        for (let btn of appButtons) {
            btn.onclick = async () => {
                let appName = btn.getAttribute("data-appName");
                if (appName != null) {
                    this.windowHandler.open(appName);
                }
            };
        }

        this.selectShrine = this.node.querySelector("select.shrineList");
        this.selectModel = this.node.querySelector("select.modelList");

        this.selectShrine.ondblclick = function (a, b) {
            if (this.value != null)
                that.windowHandler.open("shrine_editor", { shrine: this.value });
        };

        this.selectModel.ondblclick = function (a, b) {
            if (this.value != null)
                that.windowHandler.open("bfres_editor", { file: this.value });
        };

        this.shrineFilter = new Filter(this.node.querySelector(".shrine input"), this.selectShrine, "option", null);
        this.modelFilter = new Filter(this.node.querySelector(".model  input"), this.selectModel, "option", null);

        this.clear();
    }

    clear() {
    }

    openWiki() {
        electron.shell.openExternal("https://gitlab.com/ice-spear-tools/ice-spear/wikis/home");
    }

    async openProject() {
        let projectNames;
        try {
            projectNames = await this.project.listProjectNames();
        } catch (e) {
            console.error(e);
        }

        if (!Array.isArray(projectNames) || projectNames.length == 0) {
            Notify.info(`You don't have any Projects!`);
            return false;
        }

        const { value: projectName } = await swal({
            title: "选择一个项目",
            type: 'question',
            input: 'select',
            inputOptions: new Map(projectNames.map((name) => [name, name])),
            showCloseButton: true,
            showCancelButton: true,
            cancelButtonText: '取消',
            confirmButtonText: '打开',
        });

        if (projectName) {
            if (this.project.open(projectName)) {
                Notify.success(`Project '${projectName}' opened`);
                return true;
            }
            Notify.error(`Error opening '${projectName}'`);
        }

        return false;
    }

    async createProject() {
        const { value: projectName } = await swal({
            title: "给新项目取个名字",
            type: 'question',
            input: 'text',
            showCloseButton: true,
            showCancelButton: true,
            cancelButtonText: '取消',
            confirmButtonText: '创建',
        });

        if (projectName) {
            try {
                await this.project.create(projectName);
            } catch (e) {
                console.error(e);
                Notify.error(`Error creating project!`);
                return false;
            }

            Notify.success(`Project '${projectName}' created and opened!`);
            this.project.open(projectName);
        }

        return true;
    }

    async scanShrineDir() {
        const shrineRegex = /^Dungeon[0-9]{3}\.pack$/;
        let shrineDir = this.config.getValue("game.path") + "/content/Pack";

        fs.readdir(shrineDir, (err, files) => {
            if (files == null) return;
            let shrinesHtml = "";

            files.forEach(file => {
                if (shrineRegex.test(file) || file.startsWith("Remains"))  // <- 4 main dungeons
                {
                    const shrineName = file.replace(".pack", "");
                    shrinesHtml += `<option value="${shrineName}">${shrineName}</option>`;
                }
            });
            this.selectShrine.innerHTML = shrinesHtml;
        });
    }

    async scanModelTextureDir() {
        let modelDir = this.config.getValue("game.path") + "/content/Model";

        fs.readdir(modelDir, (err, files) => {
            if (files == null) return;

            this.selectModel.innerHTML = files.reduce((modelsHtml, file) => {
                // if(!file.includes(".Tex1") && !file.includes(".Tex2")) // @TODO make that an option
                return modelsHtml + `<option value="${modelDir + "/" + file}">${file}</option>`;
            }, "");
        });
    }

    async run() {
        await super.run();

        checkRenderer();

        this.scanShrineDir();
        this.scanModelTextureDir();

        // gameknife
        console.info('customize tasks inject here')

        this.stringTable = new String_Table(this.project.getCachePath());
        await this.stringTable.load();

        const Binary_File_Loader = require("binary-file").Loader;
        let fileLoader = new Binary_File_Loader();
        let byaml = new BYAML.Parser();
        this.actorData = byaml.parse(fileLoader.buffer(this.config.getValue("game.path") + "/content/Actor/ActorInfo.product.sbyml"));

        let actorInfo = {};

        for (let actor of this.actorData.Actors) {
            //this.actorInfo[actor.name.value] = actor;
            let name = actor.name.value;
            

            let actorPackPath = this.config.getValue("game.path") + "/content/Actor" + "/Pack/" + name + ".sbactorpack";
            if (fs.existsSync(actorPackPath)) {
                //console.info("Actor-Pack found for: " + actorPackPath);
                let sarc = new SARC(this.stringTable);
                let files = sarc.parse(actorPackPath);

                let modelListBuff = sarc.getFile(`Actor/ModelList/${name}.bmodellist`);
                if (modelListBuff) {
                    actorInfo[name] = { model: {}, physics: {} };
                    let bxml = new BXML(this.stringTable);
                    let bxmlData = bxml.parse(fileLoader.buffer(modelListBuff));
                    let bxmlObject = bxmlData.toObject();

                    let folder = findFolder(bxmlObject, "Folder");
                    let unitName = findFolder(bxmlObject, "UnitName");
                    actorInfo[name].model = { folder: folder, mesh: unitName };
                }

                if( actorInfo[name] )
                {
                    let physics = sarc.getFile(`Actor/Physics/${name}.bphysics`);
                    if (physics) {
                        let bxml = new BXML(this.stringTable);
                        let bxmlData = bxml.parse(fileLoader.buffer(physics));
                        let bxmlObject = bxmlData.toObject();
    
                        let setupfile = findFolder(bxmlObject, "setup_file_path");
                        let motion_type = findFolder(bxmlObject, "motion_type");
                        let mass = findFolder(bxmlObject, "mass");
                        let shape_type = findFolder(bxmlObject, "shape_type");
                        let radius = findFolder(bxmlObject, "radius");
                        
    
                        if (setupfile) {
                            actorInfo[name].physics.setupfile = setupfile;
                        }
                        if (motion_type) {
                            actorInfo[name].physics.motion_type = motion_type;
                        }
                        if (mass) {
                            actorInfo[name].physics.mass = mass;
                        }
                        if (shape_type) {
                            actorInfo[name].physics.shape_type = shape_type;
                        }
                        if (radius) {
                            actorInfo[name].physics.radius = radius;
                        }
                    }
                }
              
            } else {
                console.warn("Actor-Pack not found for: " + name);
            }
        }

        // sort actorInfo by name
        actorInfo = Object.keys(actorInfo).sort().reduce((r, k) => (r[k] = actorInfo[k], r), {});

        // write actorInfo to file
        fs.writeFileSync(`./exported/actorInfo.json`, JSON.stringify(actorInfo, null, 4), { flag: "w+" });

    }

};
