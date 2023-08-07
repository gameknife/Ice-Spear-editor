/**
* @copyright 2018 - Max Bebök
* @author Max Bebök
* @license GNU-GPLv3 - see the "LICENSE" file in the root directory
*/
const fs = require("fs-extra");
const path = require("path");

const TSCB = require("./../../lib/tscb/tscb");
const Pack_Loader = require("./loader/pack");
const Section_Helper = require("./section_helper");

const loadTileMaterial = require("./loader/material");
const loadTileMesh = require("./loader/mesh");
const loadTileWater = require("./loader/water");
const Terrain_Mesh_Creator = require("./mesh/creator");

const SECTION_WIDTH = 1000.0;
const TILE_GRID_SIZE_X = 32;
const TILE_GRID_SIZE_Y = 32;

const TILE_TO_SECTION_SCALE = 0.5;

const LOD_MAX = 0.125;
const LOD_MIN = 32;
const LOD_NUM = 8;

const LOD_LEVEL_MAX = 8;
const LOD_LEVEL_MAP = {
    8: 0.125,
    7: 0.25,
    6: 0.5,
    5: 1,
    4: 2,
    3: 4,
    2: 8,
    1: 16,
    0: 32,
};

const MAP_HEIGHT_SCALE = 0.0122075;

const MAP_TILE_LENGTH = 256;
const MAP_TILE_SIZE = MAP_TILE_LENGTH * MAP_TILE_LENGTH;
const INDEX_COUNT_SIDE = MAP_TILE_LENGTH - 1;

module.exports = class Terrain
{
    /**
     * @param {string} gamePath 
     * @param {Loader} loader 
     */
    constructor(project, gl, loader)  
    {
        this.mainConfig = project.getConfig();
        this.gamePath = this.mainConfig.getValue("game.path");
        this.loader = loader;

        this.tscbData = undefined;
        this.pathMainField = path.join(this.gamePath, "content", "Terrain", "A", "MainField");

        this.packLoader = new Pack_Loader(this.pathMainField);

        const cachePath = this.mainConfig.getValue("cache.terrainTextures") ? project.getCachePath() : "";
        this.meshCreator = new Terrain_Mesh_Creator(this.gamePath, cachePath, gl, this.loader);
    }

    loadTerrainTscb()
    {
        const tscbFile = path.join(this.gamePath, "content", "Terrain", "A", "MainField.tscb");
        this.tscbData = TSCB.parseTSCB(tscbFile);
    }

    async loadSectionMesh(sectionName, lodLevel = LOD_LEVEL_MAX)
    {
        

        await this.loader.setStatus("Get Terrain Tiles");

        lodLevel = Math.min(LOD_LEVEL_MAX, lodLevel);
        lodLevel = Math.max(0, lodLevel);

        const lodScale         = LOD_LEVEL_MAP[lodLevel];
        const sectionMidpoint  = Section_Helper.getSectionMidpoint(sectionName);
        const sectionTiles     = TSCB.getSectionTilesByPos(this.tscbData.tiles, lodScale, sectionMidpoint, SECTION_WIDTH);
        const tileSectionScale = TILE_GRID_SIZE_X / (LOD_MIN / lodScale) * SECTION_WIDTH * TILE_TO_SECTION_SCALE;

        await this.loader.setStatus("Load Terrain Textures");

        await this.meshCreator.loadTerrainTexture();

        await this.loader.setStatus("Load Terrain Mesh");

        const meshArray = [];
        let tileNum = 0;
        for(const tile of sectionTiles)
        {
            await this.loader.setInfo(`Tile ${tileNum++} / ${sectionTiles.length}`);
             // gameknife, export meshBuffer as heightmap, export materialBuffer as weight/materialmap

            // level 5 [ 0 - 19 ] ,[ 0 - 17 ]
            const tx = tile.center[0] + 9.5; // using center to fill target region
            const ty = tile.center[1] + 9.5; // 
            // level 6 [ 0 - 38 ] ,[ 0 - 34 ]
            // const tx = tile.center[0] * 2 + 18.5; // using center to fill target region
            // const ty = tile.center[1] * 2 + 18.5; // 
            // level 7 [ 0 - 38 ] ,[ 0 - 34 ]
            // level 8 [ 0 - 38 ] ,[ 0 - 34 ]


            console.info( `create Tile: name: ${tile.name} center: ${tile.center} address: [${tx}, ${ty}] lodscale: ${tile.lodScale}` );

            

            // using center to fill target region
            const materialBuffer = loadTileMaterial(this.packLoader, tile);
            const meshBuffer = loadTileMesh(this.packLoader, tile);
            const waterBuffer = loadTileWater(this.packLoader, tile);
            let bufferIndex = 0;
            // right directly to rawdata
            for(let y=0; y<MAP_TILE_LENGTH; ++y)
            {
                for(let x=0; x<MAP_TILE_LENGTH; ++x)
                {
                    document.GlobalHeightMap[(ty * 256 + y) * (256 * 20 * 2) + (tx * 256 + x) * 2 + 0] = meshBuffer[bufferIndex+0];
                    document.GlobalHeightMap[(ty * 256 + y) * (256 * 20 * 2) + (tx * 256 + x) * 2 + 1] = meshBuffer[bufferIndex+1];
                    bufferIndex += 2;
                }
            }

            //fs.writeFileSync( `./exported/hightmap_lod${lodLevel}_${x}_${y}.r16`, meshBuffer, 'binary' );
            meshArray.push(...await this.createTile(tile, tileSectionScale));
        }

        console.info( `loaded section: ${sectionName}  lod: ${lodLevel}` );

        return meshArray;
    }

    async createTile(tile, tileSectionScale)
    {
        const materialBuffer = loadTileMaterial(this.packLoader, tile);
        const meshBuffer = loadTileMesh(this.packLoader, tile);
        const waterBuffer = loadTileWater(this.packLoader, tile);

       

        const meshArray = await this.meshCreator.createTileMesh(meshBuffer, waterBuffer, materialBuffer);
        if(!meshArray) {
            console.error(`Could not load tile '${tile.name}'!`);
            return undefined;
        }

        for(const mesh of meshArray)
        {
            mesh.position.x = tile.center[0] * SECTION_WIDTH * TILE_TO_SECTION_SCALE;
            mesh.position.z = tile.center[1] * SECTION_WIDTH * TILE_TO_SECTION_SCALE;

            mesh.scale.x = tileSectionScale;
            mesh.scale.z = tileSectionScale;
        }

        return meshArray;
    }
}