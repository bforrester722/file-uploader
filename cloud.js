'use strict';


// After an image is uploaded to the Storage bucket,
// make it publicly downloadable, 
// create an optimized version, 
// create a thumbnail version then
// save the public download urls to all three
// into Firestore.
// Uses ImageMagick to process images.
// Dynamically merges the url data into the appropriate coll, doc and field


const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const mkdirp = require('mkdirp-promise');
const spawn  = require('child-process-promise').spawn;


const OPTIM_MAX_WIDTH = 1024;
const THUMB_MAX_WIDTH = 256;
const OPTIM_PREFIX    = 'optim_';
const THUMB_PREFIX    = 'thumb_';


const getRandomFileName = ext => `${crypto.randomBytes(20).toString('hex')}${ext}`;
const getTempLocalFile  = name => path.join(os.tmpdir(), name);
const getNewFilePath    = (dir, prefix, name) => 
                            path.normalize(path.join(dir, `${prefix}${name}`));


exports.init = (admin, functions) => {

  const optimizeStorageImages = functions.storage.object().onFinalize(async object => {
    try {

      const {
        contentType,
        metageneration,
        metadata,
        name: filePath,
        size
      } = object;

      // Exit if this is triggered on a file that is not an image.
      if (!contentType.startsWith('image/')) {
        console.log('This file is not an image. Not optimizing.');
        return null;
      }

      // Exit if the image is already processed.
      if ((metadata && metadata.processed) || metageneration > 1) {
        console.log('Exiting. Already processed.');
        return null;
      }

      const fileDir  = path.dirname(filePath);
      const fileName = path.basename(filePath);
      const fileExt  = path.extname(filePath);
      // Create random filenames with same extension as uploaded file.
      const randomFileName     = getRandomFileName(fileExt);
      const randomFileName2    = getRandomFileName(fileExt);
      const randomFileName3    = getRandomFileName(fileExt);
      const tempLocalFile      = getTempLocalFile(randomFileName);
      const tempLocalDir       = path.dirname(tempLocalFile);
      const tempLocalOptimFile = getTempLocalFile(randomFileName2);    
      const tempLocalThumbFile = getTempLocalFile(randomFileName3);
      const optimFilePath      = getNewFilePath(fileDir, OPTIM_PREFIX, fileName);
      const thumbFilePath      = getNewFilePath(fileDir, THUMB_PREFIX, fileName);
      const bucket             = admin.storage().bucket(object.bucket);
      const fileRef            = bucket.file(filePath);
      // Create the temp directory where the storage file will be downloaded
      await mkdirp(tempLocalDir); 

      await Promise.all([
        fileRef.makePublic(), // allow the original to be downloaded publicly
        fileRef.download({destination: tempLocalFile}) // download file from bucket
      ]);

      // best attempt at a happy medium of size/quality
      const optimOptions = [
        tempLocalFile,
        '-filter',     'Triangle',
        '-define',     'filter:support=2',
        '-resize',     `${OPTIM_MAX_WIDTH}>`, // keeps original aspect ratio
        '-unsharp',    '0.25x0.25+8+0.065',
        '-dither',     'None',
        '-posterize',  '136',
        '-quality',    '82',
        '-define',     'jpeg:fancy-upsampling=off',
        '-define',     'png:compression-filter=5',
        '-define',     'png:compression-level=9',
        '-define',     'png:compression-strategy=1',
        '-define',     'png:exclude-chunk=all',
        '-interlace',  'none',
        '-colorspace', 'sRGB',
        '-strip',
        tempLocalOptimFile
      ];

      const thumbOptions = [
        tempLocalFile, 
        '-thumbnail', 
        `${THUMB_MAX_WIDTH}>`, // keeps original aspect ratio
        tempLocalThumbFile
      ];

      // Convert the image using ImageMagick.
      await Promise.all([
        spawn('convert', optimOptions), 
        spawn('convert', thumbOptions)
      ]);
      
      const newMetadata = {
        metadata: {
          'field':         metadata.field,
          'processed':    'true',
          'originalSize': `${size}`
        }
      };

      // upload new images
      await Promise.all([
        bucket.upload(tempLocalOptimFile, {
          destination:    optimFilePath, 
          predefinedAcl: 'publicRead', 
          metadata:       newMetadata
        }),
        bucket.upload(tempLocalThumbFile, {
          destination:    thumbFilePath, 
          predefinedAcl: 'publicRead', 
          metadata:       newMetadata
        })
      ]);

      // delete the local files to free up disk space
      fs.unlinkSync(tempLocalOptimFile);
      fs.unlinkSync(tempLocalThumbFile);
      fs.unlinkSync(tempLocalFile);  


      // !!!!!!!!!!!!!!!! Code sample below does not work as of 11/6/2018 !!!!!!!!!!!!!!!!!!!!!!
      //    This would be the perfered best practice way to get a 
      //    new download url for the processed image, but
      //    it becomes invalid after 10/12 days because of gcs service 
      //    account keys getting renewed in their backend.  
      //    see: https://github.com/googleapis/nodejs-storage/issues/244
      // Get the Signed URLs for the thumbnail and original image.
      // const config = {
      //   action:  'read',
      //   expires: '03-01-2500',
      // };
      // const file  = bucket.file(filePath);
      // // Go to your project's Cloud Console > IAM & admin > IAM, 
      // // Find the App Engine default service account and ADD
      // // the Service Account Token Creator ROLE to that member. 
      // // This will allow your app to create signed public URLs to the images.
      // const [url]      = await file.getSignedUrl(config);
      // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


      const getUrl = path => 
        `https://storage.googleapis.com/${object.bucket}/${path}`; // short term workaround/hack
      
      const words     = fileDir.split('/');
      const coll      = words.slice(0, words.length - 1).join('/');
      const doc       = words[words.length - 1];
      const key       = fileName.split('.')[0];
      const original  = getUrl(filePath); 
      const optimized = getUrl(optimFilePath);
      const thumbnail = getUrl(thumbFilePath);

      // fully dynamic save to firestore doc
      await admin.firestore().collection(coll).doc(doc).set(
        {
          [metadata.field]: { // file-uploader custom element field prop on client
            [key]: {
              optimized,
              original,
              thumbnail
            }
          }
        }, 
        {merge: true}
      );

      return null;
    }
    catch (error) {
      console.error(error);
      throw new functions.https.HttpsError('unknown', 'image optimization error', error);
    }
  });

  return optimizeStorageImages;
};
