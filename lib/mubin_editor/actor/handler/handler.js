/**
* @copyright 2018 - Max Bebök
* @author Max Bebök
* @license GNU-GPLv3 - see the "LICENSE" file in the root directory
*/

const uuid = require("uuid/v4");
const path = require("path");

const BYAML = require("byaml-lib");
const Main_Config  = require("../../../config/main_config");

const Actor        = require('../actor');
const Actor_Params = require('../params');
const Actor_Cache  = require('../cache/cache');
const Actor_Templates = require('../template');

const Actor_Object_Loader = require('../object/loader');
const Actor_Object_Handler = require('../object/handler');

const importActors = require("./importer");

const fs = require('fs');

module.exports = class Actor_Handler
{
    /**
     * @param {Shrine_Renderer} mubinRenderer 
     * @param {Loader} loader 
     * @param {String_Table} stringTable 
     */
    constructor(mubinRenderer, project, loader, stringTable = null)
    {
        this.mubinRenderer = mubinRenderer;
        this.loader = loader;
        this.stringTable = stringTable;

        this.editor = undefined;
        this.history = undefined;
        this._showLinks = false;

        this.actors = {};
        this.clear();

        const actorCache = new Actor_Cache(
            project.getCachePath(),
            project.mainConfig.getValue("cache.actors")
        );

        const cfg = new Main_Config();
        const actorPath  = cfg.getValue("game.path") + "/content/Actor";
        const modelsPath = cfg.getValue("game.path") + "/content/Model";

        const actorObjLoader = new Actor_Object_Loader(actorPath, modelsPath, actorCache, this.mubinRenderer, this.loader, this.stringTable);
        this.actorObjHandler = new Actor_Object_Handler(actorObjLoader, this.mubinRenderer);
    }

    set showLinks(val) {
        this._showLinks = !!val;

        if(this._showLinks) {
            this.updateLinks();
        } else {
            this.clearLinks();
        }
    }

    async init()
    {
        await this.actorObjHandler.init();
    }

    update()
    {
        this.actorObjHandler.update();
    }

    updateLinks()
    {
        if(!this._showLinks) {
            return;
        }

        Object.values(this.actors).forEach(actor => 
        {
            if(actor.params.LinksToObj)
            {
                const scene = this.mubinRenderer.renderer.scene;

                actor.links.forEach(link => scene.remove(link));
                actor.links = [];

                actor.params.LinksToObj.forEach(link => {
                    const targetId = link.DestUnitHashId.value;
                    const linkedActor = this.getActorByHashId(targetId);
                    if (linkedActor) 
                    {
                        const material = new THREE.LineBasicMaterial({color: 0x0000ff});
                        var geometry = new THREE.Geometry();
                        geometry.vertices = [actor.objInstance.pos, linkedActor.objInstance.pos];

                        const line = new THREE.Line(geometry, material);
                        scene.add(line);
                        actor.links.push(line);
                    }
                });
            }
        });
    }

    clearLinks() 
    {
        Object.values(this.actors).forEach(
            actor => {
                actor.links.forEach(link => this.mubinRenderer.renderer.scene.remove(link));
                actor.links = [];
            }
        );
    }

    clear()
    {
        for(let actor of Object.values(this.actors))
        {
            actor.delete();
        }

        this.actors = {};
        this.dataActorDyn    = {};
        this.dataActorStatic = {};
        this.dataActorProd   = [];
    }

    setEditor(editor) 
    {
        this.editor = editor;
    }

    setHistory(history)
    {
        this.history = history;
    }

    getActorArray(type)
    {
        if(type === "Dynamic") {
            return this.dataActorDyn;
        } else if(type == "Static") {
            return this.dataActorStatic;
        } else if(parseInt(type) == type) {
            return this.dataActorProd[type];
        }
        console.error(`getActorArray: invalid type '${type}'`);
    }

    getActorByHashId(hashId)
    {
        return Object.values(this.actors).find(actor => actor.getHashId() == hashId);
    }

    getActorArrayObject(type)
    {
        if(type === "Dynamic") {
            return this.dataActorDyn.Objs;
        } else if(type == "Static") {
            return this.dataActorStatic.Objs;
        } else if(parseInt(type) == type) {
            return this.dataActorProd[type];
        }

        console.error(`getActorArrayObject: invalid type '${type}'`);
    }

    toJSON() {
        return JSON.stringify({
            dataActorDyn:    this.dataActorDyn,
            dataActorStatic: this.dataActorStatic,
            dataActorProd:   this.dataActorProd
        });
    }

    importJSON(data) {
        importActors(this, data);
    }

    /**
     * adds an actor (can be a mubin or PrOD object)
     * @param {string} name actor name
     * @param {Object} params BYAML params
     * @param {string|number} type "Dynamic"/"Static" or a number for PrOD files
     * @param {bool} alreadyIncluded if false, the params are added to the param object/array
     * @returns {Actor}
     */
    async addActor(name, params, type, alreadyIncluded = true)
    {
        const actorObjInstance = await this.actorObjHandler.createInstance(name);
        if(!actorObjInstance)
            return undefined;

        Actor_Params.normalize(params);

        const actor = new Actor(params, type, uuid(), actorObjInstance);
        actor.setHandler(this);

        if(alreadyIncluded)
        {
            switch(type)
            {
                case "Dynamic":
                    this.dataActorDyn.Objs.push(params);
                break;
                case "Static":
                    this.dataActorStatic.Objs.push(params);
                break;
                default: // PrOD
                    this.dataActorProd[type].push(params);
                break;
            }
        }

        this.actors[actor.id] = actor;
        actor.update();

        // gameknife
        let instance = actor.objInstance;
        let modelName = instance.actorObject.modelGroup.name;
        let mainModelName = instance.actorObject.mainModelName ? instance.actorObject.mainModelName : "None";
        if(type == "Static" || type == "Dynamic")
        {
            if('__DEFAULT_BOX' != modelName && mainModelName != "None")
            {
                // unreal  YAW - PITCH - ROLL = YZX
                // zelda ZYX

                // rotation order xyz to zyx
                let euler = new THREE.Euler(instance.rot.x, instance.rot.y, instance.rot.z, 'ZYX');
                let quaternion = new THREE.Quaternion();
                quaternion.setFromEuler(euler);
                euler.setFromQuaternion(quaternion, 'YZX');

                document.export_ulevel[`${name}_${actor.id}`] = { actor: name, 
                    location: `${instance.pos.x * 100},${instance.pos.z * 100},${instance.pos.y * 100}`,
                    rotation: `${euler.z * 180 / 3.1415926535897932 },${-euler.y * 180 / 3.1415926535897932},${euler.x * 180 / 3.1415926535897932}`,
                    scale: `${instance.scale.x},${instance.scale.z},${instance.scale.y}`};   
                // let euler = new THREE.Euler(instance.rot.x, instance.rot.y, instance.rot.z, 'ZYX');
                // let quaternion = new THREE.Quaternion();
                // quaternion.setFromEuler(euler);
                // euler.setFromQuaternion(quaternion, 'YZX');
                // RelativeRotation=(Pitch=${euler.z * 180 / 3.1415926535897932 },Yaw=${-euler.y * 180 / 3.1415926535897932},Roll=${euler.x * 180 / 3.1415926535897932})

                // let UE_Actor = `Begin Actor Class=/Script/Engine.StaticMeshActor
                // Begin Object Class=/Script/Engine.StaticMeshComponent Name="StaticMeshComponent0"
                // End Object
                // Begin Object Name="StaticMeshComponent0"
                // StaticMesh=/Script/Engine.StaticMesh'"/Game/Art/botw/${mainModelName}.${mainModelName}"'
                // RelativeLocation=(X=${instance.pos.x * 100},Y=${instance.pos.z * 100},Z=${instance.pos.y * 100})
                // RelativeRotation=(Pitch=${euler.z * 180 / 3.1415926535897932 },Yaw=${-euler.y * 180 / 3.1415926535897932},Roll=${euler.x * 180 / 3.1415926535897932})
                // RelativeScale3D=(X=${instance.scale.x},Y=${instance.scale.y},Z=${instance.scale.z})
                // End Object
                // StaticMeshComponent="StaticMeshComponent0"
                // RootComponent="StaticMeshComponent0"
                // ActorLabel="${name}"
                // End Actor
                // `;

                // let UE_Actor = `Begin Actor Class=/Game/BluePrints/Botw/ActorList/BP_${name}.BP_${name}_C Name=${name}_${uuid()}
                // Begin Object Class=/Script/Engine.SceneComponent Name="RootComponent"
                // End Object
                // Begin Object Name="RootComponent"
                // RelativeLocation=(X=${instance.pos.x * 100},Y=${instance.pos.z * 100},Z=${instance.pos.y * 100})
                // RelativeRotation=(Pitch=${euler.z * 180 / 3.1415926535897932 },Yaw=${-euler.y * 180 / 3.1415926535897932},Roll=${euler.x * 180 / 3.1415926535897932})
                // RelativeScale3D=(X=${instance.scale.x},Y=${instance.scale.y},Z=${instance.scale.z})
                // End Object
                // RootComponent="RootComponent"
                // ActorLabel="${name}"
                // End Actor
                // `;

                // Begin Actor Class=/Game/BluePrints/Botw/ActorList/BP_AncientBallSwitch2.BP_AncientBallSwitch2_C Name=BP_AncientBallSwitch2_C_1
                // Begin Object Class=/Script/Engine.SceneComponent Name="RootComponent"
                // End Object
                // Begin Object Name="RootComponent"
                // RelativeLocation=(X=-536227.979967,Y=-446391.984517,Z=13938.116220)
                // End Object
                // RootComponent="RootComponent"
                // ActorLabel="BP_AncientBallSwitch2"
                // End Actor

                //fs.writeFileSync(`./exported/${document.GK_MAP_NAME}_scene.txt`, UE_Actor, { flag: "a+" });    
            }
        }
        else if(type == "Dynamic")
        {

        }
        else
        {
            //console.info(`prod instance: ${name} - ${mainModelName}`);
        }

        if(mainModelName == "None")
        {
            console.info(`logic instance: ${name} - ${mainModelName}`);
        }

        return actor;
    }

    /**
     * removes an actor, also removes it from all other places (editor, renderer, obj array)
     * @param {Actor} actor actor to remove
     * @returns {boolean} false if it was already removed / not set here
     */
    async deleteActor(actor)
    {
        const paramObj = this.getActorArrayObject(actor.type);
        const objIndex = paramObj.indexOf(actor.params);
        if(objIndex >= 0)
        {
            paramObj.splice(objIndex, 1);
        }else{
            console.warn("Removed Actor's params are not in the BYAML file!");
            console.warn(actor);
            return false;
        }

        this.deselectActor(actor);

        delete this.actors[actor.id];
        return true;
    }

    /**
     * deselects an actor
     * @param {Actor} actor to deselect
     */
    deselectActor(actor)
    {
        if(this.editor)
            this.editor.deselectActor(actor);
    }

    /** 
     * deselects an actor
     * @param {Actor} actor to deselect
     */
    focusActor(actor)
    {
        if(this.editor)
            this.editor.focusActor(actor);
    }

    /**
     * changes the actor type
     * @param {*} actor 
     * @param {*} type 
     */
    changeActorType(actor, type)
    {
        const oldType = type == "Dynamic" ? "Static" : "Dynamic";
        const arrayOld = this.getActorArray(oldType);
        const params = actor.params;

        // check if the actor is in the old array and also not in the new one
        if(!arrayOld.Objs.includes(params))
            return;

        const arrayNew = this.getActorArray(type);

        if(arrayNew.Objs.includes(params))
            return;

        // switch between arrays
        arrayOld.Objs = arrayOld.Objs.filter(a => a != params);
        arrayNew.Objs.push(params);

        this.history.add();
    }

    /**
     * copies an actor and adds it to the scene
     * @param {Actor} actor actor to copy
     * @returns {Actor} new actor
     */
    async copyActor(actor)
    {
        console.log(actor);
        const paramCopy = BYAML.Helper.deepCopy(actor.params);

        if(paramCopy.Translate)
        {
            //paramCopy.Translate[0].value += 1.0;
        }

        paramCopy.HashId.value = this.getFreeHashId();
        const newActor = await this.addActor(actor.getName(), paramCopy, actor.type);
        this.history.add();

        if(this.editor) {
            this.editor.selectActor(newActor);
            this.editor.deselectActor(actor);
        }

        return newActor;
    }

    async addFromData(actorData, actorType = "Dynamic")
    {
        const actorName = actorData.UnitConfigName.value;
        const bymlParams = BYAML.Helper.deepCopy(actorData);
        const newActor = await this.addActor(actorName, bymlParams, actorType);

        if(newActor.getHashId() == 0) {
            newActor.setHashId(this.getFreeHashId());
        }

        this.history.add();

        if(this.editor) {
            newActor.move(this.editor.getCurrentPos());
            this.editor.selectActor(newActor);
        }
        
        return newActor;
    }

    async addFromTemplate(name)
    {
        const actorData = await Actor_Templates.getData(name);
        const hashIds = new Array(actorData.actors.length).fill(0).map((_, i) => i + this.getFreeHashId());
        
        let actorDataStr = JSON.stringify(actorData.actors);
        hashIds.forEach((hashId, idx) => {
            actorDataStr = actorDataStr.replace(new RegExp(`"\\{ID${idx}\\}"`, 'g'), hashId)
        });

        JSON.parse(actorDataStr).forEach(actorData => {
            this.addFromData(actorData, "Static");
        });
    }

    getFreeHashId()
    {
        const maxStatic = Math.max(...this.dataActorStatic.Objs.map(actor => actor.HashId.value));
        const maxDyn    = Math.max(...this.dataActorDyn.Objs.map(actor => actor.HashId.value));
        return Math.max(maxStatic, maxDyn) + 1;
    }
    
    /**
     * refreshes the actor model by removing and adding it again
     * should be called after an actor object changed
     * @param {Actor} actor 
     */
    refreshActorRenderer(actor)
    {
        this.mubinRenderer.deleteActor(actor);
        this.mubinRenderer.addActor(actor);
    }

    /**
     * assigns a new param object to the actor and the internal BYAML data
     * @param {Actor} actor 
     * @param {Object} params 
     */
    assignNewActorParams(actor, params)
    {
        const dataObj = actor.type == "Dynamic" ? this.dataActorDyn.Objs : this.dataActorStatic.Objs;
        const dataIndex = dataObj.indexOf(actor.params);
        if(dataIndex < 0)
        {
            console.warn("Actor assign new params, actor has no params set in Objs!");
            return undefined;
        }

        dataObj[dataIndex] = params;
        actor.params = dataObj[dataIndex];
        
        return dataObj[dataIndex];
    }

    findActorDefinitions(name)
    {
        name = name.toLowerCase();
        return this.actorObjHandler.actorObjLoader.actorData.Actors.filter(
            entry => entry.name.value.toLowerCase().includes(name)
        );
    }
};
