/**
* @copyright 2018 - Max Bebök
* @author Max Bebök
* @license GNU-GPLv3 - see the "LICENSE" file in the root directory
*/

const fs   = require('fs-extra');
const path = require('path');
const PNG = require('pngjs').PNG;
const TGA = require('tga');

const Binary_File_Loader = require("binary-file").Loader;

/**
 * Class to load the shrine model and its textures
 */
module.exports = class Field_Model_Loader
{
    /**
     * loads an array of section meshes
     * @param {string} fieldPath shrine base directory
     * @param {string} fieldSection shrine name
     * @param {Terrain} terrain terrain handler
     * @returns {Array} the main model parser
     */
    async load(fieldPath, fieldSection, terrain)
    {
        // gameknife
        // 5 may have all 9x9 sections
        const lodLevel = 5;
        terrain.loadTerrainTscb();

        // gameknife, load all sections
        // create a buffer that can hold all sections

        // level 5 [ 0 - 19 ] ,[ 0 - 19 ] 256 each
        // level 6 [ 0 - 38 ] ,[ 0 - 38 ] 256 each

        const SidePixel = 256 * 20;

        document.GlobalHeightMap = Buffer.alloc(256 * 256 * 20 * 20 * 2);
        document.GlobalWeightMap = Buffer.alloc(256 * 256 * 20 * 20 * 4);

        //await terrain.loadSectionMesh('J-8', lodLevel);

        let result = await terrain.loadSectionMesh(fieldSection, lodLevel) || [];

        if( false )
        {
            // from A to J
            // from 1 to 8
            // 9x9 sections
            for( let i = 0; i < 9; i++ )
            {
                for( let j = 0; j < 9; j++ )
                {
                    await terrain.loadSectionMesh( String.fromCharCode(65 + j) + '-' + (i + 1), lodLevel);
                }
            }

            fs.writeFileSync( `./exported/hightmap_lod${lodLevel}.r16`, document.GlobalHeightMap, 'binary' );
            
            var buf = TGA.createTgaBuffer(SidePixel, SidePixel, document.GlobalWeightMap);
            fs.writeFileSync(`./exported/weightmap_lod${lodLevel}.tga`, buf);
        }

        return result;
    }
}