'use strict';

const os        = require('os');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const mkdirp    = require('mkdirp-promise');
const spawn     = require('child-process-promise').spawn;

// When an image is uploaded in the Storage bucket,
// it is optimized automatically using ImageMagick.

exports.init = (admin, functions) => {

  const optimizeStorageImages = functions.storage.object().onFinalize(async object => {
    try {
      const {
        cacheControl,
        contentDisposition,
        contentEncoding,
        contentLanguage,
        contentType,
        customMetadata,
        metageneration,
        metadata: oldMetadata,
        name:     filePath,
        size
      } = object;
      // console.log('incoming file size: ', size);

      // Exit if this is triggered on a file that is not an image.
      if (!contentType.startsWith('image/')) {
        console.log('This file is not an image. Not optimizing.');
        return null;
      }
      // Exit if the image is already optimized.
      if ((
        oldMetadata && 
        oldMetadata.customMetadata && 
        oldMetadata.customMetadata.optimized) || 
        metageneration > 1
      ) {
        console.log('Exiting. Already optimized.');
        return null;
      }

      // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      // HACK:
      //      Cannot set new metadata for some reason.
      //      Gave up after spending many hours on research. 
      //      Currently no resolution other than
      //      checking if its undefined, which is the case 
      //      after trying to set it in the upload function as per docs
      // console.log('object: ', object);
      // console.log('oldMetadata: ', oldMetadata);
      // console.log('customMetadata: ', customMetadata);
      // console.log('metageneration: ', metageneration);
      if (!oldMetadata) {
        console.log('Exiting. Already optimized but no metadata.');
        return null;
      }
      // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      
      const metadata = {
        cacheControl,
        contentDisposition,
        contentEncoding,
        contentLanguage,
        contentType,
        customMetadata: {
          'optimized':    'true',
          'originalSize': `${size}`
        }
        // To enable Client-side caching you can set the Cache-Control headers here. Uncomment below.
        // 'Cache-Control': 'public,max-age=3600',
      };
      // Create random filename with same extension as uploaded file.
      const randomFileName     = `${crypto.randomBytes(20).toString('hex')}${path.extname(filePath)}`;
      const randomFileName2    = `${crypto.randomBytes(20).toString('hex')}${path.extname(filePath)}`;
      const tempLocalFile      = path.join(os.tmpdir(), randomFileName);
      const tempLocalDir       = path.dirname(tempLocalFile);
      const tempLocalOptimFile = path.join(os.tmpdir(), randomFileName2);
      const bucket             = admin.storage().bucket(object.bucket);
      // Create the temp directory where the storage file will be downloaded.
      await mkdirp(tempLocalDir);
      // Download file from bucket.
      await bucket.file(filePath).download({destination: tempLocalFile});
      const imgOptimizationOptions = [
        tempLocalFile,
        '-filter',     'Triangle',
        '-define',     'filter:support=2',
        '-resize',     '1024>', // max width is 1024px
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
      // Convert the image to JPEG using ImageMagick.
      await spawn('convert', imgOptimizationOptions);
      // console.log('optimized image created at', tempLocalOptimFile);
      // Uploading the JPEG image.
      await bucket.upload(tempLocalOptimFile, {
        destination:    filePath, 
        predefinedAcl: 'publicRead', 
        metadata
      });
      // console.log('Done optimizing');
      // Once the image has been converted delete the local files to free up disk space.
      fs.unlinkSync(tempLocalOptimFile);
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

      const url        = `https://storage.googleapis.com/${object.bucket}/${object.name}`; // short term workaround/hack
      const words      = filePath.split('/');
      const coll       = words.slice(0, words.length - 2).join('/');
      const lastWord   = words[words.length - 1];
      const fileNames  = lastWord.split('.');
      const fileName   = fileNames.slice(0, fileNames.length - 1).join('.');
      const doc        = words.slice(words.length - 2, words.length - 1)[0];
      await admin.firestore().collection(coll).doc(doc).set({images: {[fileName]: {url}}}, {merge: true});
      return null;
    }
    catch (error) {
      console.error(error);
      throw new functions.https.HttpsError('unknown', 'image optimization error', error);
    }
  });

  return optimizeStorageImages;
};





// exports.optimizeStorageImages = functions.storage.object().onFinalize(async object => {
//   try {
//     const {
//       cacheControl,
//       contentDisposition,
//       contentEncoding,
//       contentLanguage,
//       contentType,
//       customMetadata,
//       metageneration,
//       metadata: oldMetadata,
//       name:     filePath,
//       size
//     } = object;
//     // console.log('incoming file size: ', size);

//     // Exit if this is triggered on a file that is not an image.
//     if (!contentType.startsWith('image/')) {
//       console.log('This file is not an image. Not optimizing.');
//       return null;
//     }
//     // Exit if the image is already optimized.
//     if ((
//       oldMetadata && 
//       oldMetadata.customMetadata && 
//       oldMetadata.customMetadata.optimized) || 
//       metageneration > 1
//     ) {
//       console.log('Exiting. Already optimized.');
//       return null;
//     }

//     // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     // HACK:
//     //      Cannot set new metadata for some reason.
//     //      Gave up after spending many hours on research. 
//     //      Currently no resolution other than
//     //      checking if its undefined, which is the case 
//     //      after trying to set it in the upload function as per docs
//     // console.log('object: ', object);
//     // console.log('oldMetadata: ', oldMetadata);
//     // console.log('customMetadata: ', customMetadata);
//     // console.log('metageneration: ', metageneration);
//     if (!oldMetadata) {
//       console.log('Exiting. Already optimized but no metadata.');
//       return null;
//     }
//     // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    
//     const metadata = {
//       cacheControl,
//       contentDisposition,
//       contentEncoding,
//       contentLanguage,
//       contentType,
//       customMetadata: {
//         'optimized':    'true',
//         'originalSize': `${size}`
//       }
//       // To enable Client-side caching you can set the Cache-Control headers here. Uncomment below.
//       // 'Cache-Control': 'public,max-age=3600',
//     };
//     // Create random filename with same extension as uploaded file.
//     const randomFileName     = `${crypto.randomBytes(20).toString('hex')}${path.extname(filePath)}`;
//     const randomFileName2    = `${crypto.randomBytes(20).toString('hex')}${path.extname(filePath)}`;
//     const tempLocalFile      = path.join(os.tmpdir(), randomFileName);
//     const tempLocalDir       = path.dirname(tempLocalFile);
//     const tempLocalOptimFile = path.join(os.tmpdir(), randomFileName2);
//     const bucket             = admin.storage().bucket(object.bucket);
//     // Create the temp directory where the storage file will be downloaded.
//     await mkdirp(tempLocalDir);
//     // Download file from bucket.
//     await bucket.file(filePath).download({destination: tempLocalFile});
//     const imgOptimizationOptions = [
//       tempLocalFile,
//       '-filter',     'Triangle',
//       '-define',     'filter:support=2',
//       '-resize',     '1024>', // max width is 1024px
//       '-unsharp',    '0.25x0.25+8+0.065',
//       '-dither',     'None',
//       '-posterize',  '136',
//       '-quality',    '82',
//       '-define',     'jpeg:fancy-upsampling=off',
//       '-define',     'png:compression-filter=5',
//       '-define',     'png:compression-level=9',
//       '-define',     'png:compression-strategy=1',
//       '-define',     'png:exclude-chunk=all',
//       '-interlace',  'none',
//       '-colorspace', 'sRGB',
//       '-strip',
//       tempLocalOptimFile
//     ];
//     // Convert the image to JPEG using ImageMagick.
//     await spawn('convert', imgOptimizationOptions);
//     // console.log('optimized image created at', tempLocalOptimFile);
//     // Uploading the JPEG image.
//     await bucket.upload(tempLocalOptimFile, {
//       destination:    filePath, 
//       predefinedAcl: 'publicRead', 
//       metadata
//     });
//     // console.log('Done optimizing');
//     // Once the image has been converted delete the local files to free up disk space.
//     fs.unlinkSync(tempLocalOptimFile);
//     fs.unlinkSync(tempLocalFile);
    
//     // !!!!!!!!!!!!!!!! Code sample below does not work as of 11/6/2018 !!!!!!!!!!!!!!!!!!!!!!
//     //    This would be the perfered best practice way to get a 
//     //    new download url for the processed image, but
//     //    it becomes invalid after 10/12 days because of gcs service 
//     //    account keys getting renewed in their backend.  
//     //    see: https://github.com/googleapis/nodejs-storage/issues/244
//     // Get the Signed URLs for the thumbnail and original image.
//     // const config = {
//     //   action:  'read',
//     //   expires: '03-01-2500',
//     // };
//     // const file  = bucket.file(filePath);
//     // // Go to your project's Cloud Console > IAM & admin > IAM, 
//     // // Find the App Engine default service account and ADD
//     // // the Service Account Token Creator ROLE to that member. 
//     // // This will allow your app to create signed public URLs to the images.
//     // const [url]      = await file.getSignedUrl(config);
//     // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

//     const url        = `https://storage.googleapis.com/${object.bucket}/${object.name}`; // short term workaround/hack
//     const words      = filePath.split('/');
//     const coll       = words.slice(0, words.length - 2).join('/');
//     const lastWord   = words[words.length - 1];
//     const fileNames  = lastWord.split('.');
//     const fileName   = fileNames.slice(0, fileNames.length - 1).join('.');
//     const doc        = words.slice(words.length - 2, words.length - 1)[0];
//     await admin.firestore().collection(coll).doc(doc).set({images: {[fileName]: {url}}}, {merge: true});
//     return null;
//   }
//   catch (error) {
//     console.error(error);
//     throw new functions.https.HttpsError('unknown', 'image optimization error', error);
//   }
// });
