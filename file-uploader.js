/**
 * `file-uploader`
 * 
 *  Accepts files from user and handles uploading/optimization/deleting/previewing/rearranging
 *
 *
 *  properites:
 *
 *    accept - <String> optional: file type to allow from user. 
 *             ie. 'audio', 'video', 'audio,.jpg', '.doc', ... 
 *             default -> 'image'
 *
 *
 *    coll - <String> required: firestore collection path to use when saving
 *           ie. `cms/ui/programs`, 'images', `users`
 *           default -> undefined
 *
 *
 *    doc - <String> required: firestore document path to use when saving
 *           ie. `${program}`, 'home', `${uid}`
 *           default -> undefined
 *
 *
 *    field - <String> optional: firestore document object field (prop) to save the file metadata/info
 *            ie. 'backgroundImg', 'carousel', 'profileImg'
 *            default -> 'images'
 *
 *
 *    multiple - <Boolean> optional: false -> only accept one file at a time, true -> allow many files at the same time
 *               default -> false
 *
 *
 *
 *  events:
 *
 *    'data-changed' - fired any time file(s) data changes
 *                     detail -> {_tempUrl, coll, doc, name, ext, type, size, path, field, index}
 *                                _tempUrl - present for images only - window.URL.createObjectURL
 *                                index   - used for multiple files ordering
 *
 *
 *    'file-received' - fired when user starts a file upload process
 *                      detail -> {_tempUrl, coll, doc, name, ext, type, size, path, field, index}
 *                                 _tempUrl - present for images only - window.URL.createObjectURL
 *                                 index   - used for multiple files ordering
 *
 *  
 *    'file-uploaded' - fired after successful upload operation
 *                      detail -> {url, coll, doc, name, ext, type, size, path, field, index}
 *                                 index - used for multiple files ordering
 *                                 url   - public download url for full size original
 *
 *
 *    'file-optimized' - image files only - fired after optimization cloud function has finished processing image
 *                       detail -> {optimized, thumbnail, url, coll, doc, name, ext, type, size, path, field, index}
 *                                 optimized - public download url for processed and resized file (1024px max width)
 *                                 thumbnail - public download url for processed and resized file (256px wide)
 *                                 url       - public download url for full size original
 *
 *
 *    'file-deleted' - fired after user deletes a file
 *                     detail -> {url, coll, doc, name, ext, type, size, path, field, index <, optimized, thumbnail>}
 *
 *     
 *    'upload-cancelled' - fired if user cancels the upload process
 *                         detail -> {url, coll, doc, name, ext, type, size, path, field, index <, optimized, thumbnail>}          
 *
 *
 *  
 *  methods:
 *
 *    getData() - returns file data {[file name]: {url, name, ext, type, size, path, field, index <, optimized, thumbnail>}, ...}
 *              
 *
 *    delete(name) - name  -> <String> required: file name to target for delete operation
 *                            returns Promise 
 *                            resolves to {url, name, ext, type, size, path, field, index <, optimized, thumbnail>}
 *
 *    
 *    deleteAll() - returns Promise 
 *                  resolves to {[file name]: {url, name, ext, type, size, path, field, index <, optimized, thumbnail>}, ...}
 *
 *
 *    slots:
 *
 *      layout - occupies area above delete zone
 *               default -> drag-drop-list
 *      preview - placed under file dropzone
 *                default -> empty
 *
 *
 * @customElement
 * @polymer
 * @demo demo/index.html
 */
import {
  SpritefulElement, 
  html
}                 from '@spriteful/spriteful-element/spriteful-element.js';
import {
  compose, 
  join, 
  map, 
  split
}                 from '@spriteful/lambda/lambda.js';
import {
  isDisplayed, 
  listen, 
  message, 
  schedule,
  unlisten,
  wait,
  warn
}                 from '@spriteful/utils/utils.js';
import htmlString from './file-uploader.html';
import services   from '@spriteful/services/services.js';
import '@spriteful/app-icons/app-icons.js';
import '@spriteful/app-modal/app-modal.js';
import '@spriteful/app-spinner/app-spinner.js';
import '@spriteful/cms-icons/cms-icons.js';
import '@spriteful/drag-drop-list/drag-drop-list.js';
import '@spriteful/drag-drop-files/drag-drop-files.js';
import '@spriteful/lazy-video/lazy-video.js';
import '@polymer/iron-image/iron-image.js';
import '@polymer/paper-button/paper-button.js';
import '@polymer/paper-input/paper-input.js';


const trim                = str => str.trim();
const toLower             = str => str.toLowerCase();
const removeSpacesAndCaps = compose(trim, split(' '), map(toLower), join(''));


const formatFileSize = size => {
  if (size < 1024) {
    return `${size}bytes`;
  } 
  else if (size >= 1024 && size < 1048576) {
    return `${(size / 1024).toFixed(1)}KB`;
  } 
  else if (size >= 1048576) {
    return `${(size / 1048576).toFixed(1)}MB`;
  }
};


const dropIsOverDeleteArea = ({top, right, bottom, left, x, y}) => {
  if (y < top  || y > bottom) { return false; }
  if (x < left || x > right)  { return false; }
  return true;
};


const nameFromFileName = filename => filename.split('.')[0];


const nameFromPath = path => {
  const words = path.split('/');
  return nameFromFileName(words[words.length - 1]);
};


const getImageFileDeletePaths = path => {
  const words     = path.split('/');
  const base      = words.slice(0, words.length - 1).join('/');
  const fileName  = words[words.length - 1];
  const optimPath = `${base}/optim_${fileName}`;
  const thumbPath = `${base}/thumb_${fileName}`;

  return [
    path,
    optimPath,
    thumbPath
  ];
};


const collectionToDataObj = collection => {
  return collection.reduce((accum, obj) => {
    accum[obj.name] = obj;
    return accum;
  }, {});
};


class FileUploader extends SpritefulElement {
  static get is() { return 'file-uploader'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {
      // any valid HTML5 input accept string or
      // one of 3 shorthand values: 'image', 'video' or 'audio'
      accept: {
        type: String,
        value: 'image'
      },
      // firestore collection name
      coll: String,
      // firestore document name
      doc: String,
      // firestore document prop
      field: {
        type: String,
        value: 'images'
      },
      // one file upload or multiple files
      multiple: {
        type: Boolean,
        value: false
      },

      _dbData: Object,

      _directory: {
        type: String,
        computed: '__computeDirectory(coll, doc)'
      },

      _filesToRename: Array,

      _items: {
        type: Array,
        computed: '__computeItems(_dbData, field)'
      },

      _itemToDelete: Object,

      _newFileNames: {
        type: Object,
        value: () => ({})
      },

      _targetToDelete: Object

    };
  }


  static get observers() {
    return [
      '__collDocFieldChanged(coll, doc, field)'
    ];
  }


  __computeItems(data) {
    if (!data) { return; }

    const keys = Object.keys(data);

    const items = keys.
      reduce((accum, key) => {
        const item = data[key];
        if (item) {          
          const {index} = item;
          if (typeof index === 'number') {
            accum[index] = item;
          }
          else {
            accum = [...accum, item];
          }
        }
        return accum;
      }, []);

    return items;
  }


  __computeThumbnailSrc(item) {
    if (!item) { return '#'; }

    const {original, _tempUrl, thumbnail} = item;

    if (thumbnail) { return thumbnail; }
    if (original)  { return original; }
    return _tempUrl;
  }


  __computeFileAccept(accept) {
    if (!accept || accept === 'image') { return 'image/*'; }
    if (accept === 'audio') { return 'audio/*'; } 
    if (accept === 'video') { return 'video/*'; }
    return accept;
  }


  __computeDirectory(coll, doc) {
    if (!coll || !doc) { return; }
    return `${coll}/${doc}`;
  }


  __computeListClass(multiple) {
    return multiple ? '' : 'center-list';
  }


  __computeIronImageHidden(item) {
    if (!item || !item.type) { return true; }
    return !item.type.includes('image');
  }


  __computeIronIconHidden(item) {
    if (!item || !item.type) { return true; }
    return !item.type.includes('audio');
  }


  __computeLazyVideoHidden(item) {    
    if (!item || !item.type) { return true; }
    return !item.type.includes('video');
  }


  __computeFileNamePlaceholder(fileName) {
    return fileName.split('.')[0];
  }


  __computeRenameModalHeading(multiple) {
    return multiple ? 'Rename Files' : 'Rename File';
  }


  __computeRenameModalPural(multiple) {
    return multiple ? 'these files' : 'this file';
  }


  __computeRenameModalText(multiple) {
    return multiple ? 'File names MUST be unique.' : 'The name MUST be unique.';
  }

  // start a subscription to file data changes
  async __collDocFieldChanged(coll, doc, field) {
    if (!coll || !doc || !field) { return; }
    if (this._unsubscribe) {
      this._unsubscribe();
    }
    else { 
      // app is still initializing, 
      // so give app-settings time to call enablePersistence
      // on services before calling subscribe
      await wait(500);
    }

    const callback = async docData => {
      this._dbData = undefined; // force template to restamp
      await schedule();         // force template to restamp
      this._dbData = docData[field];
      this.fire('data-changed', this._dbData);
    };

    const errorCallback = error => {
      this._dbData = undefined;
    };

    this._unsubscribe = services.subscribe({
      callback,
      coll,
      doc,
      errorCallback
    });
  }

  // iron-image on-loaded-changed
  async __handleImageLoadedChanged(event) {
    const {detail, model} = event;
    if (!model.item) { return; }
    const {value: loaded}      = detail;
    const {original, _tempUrl} = model.item;

    if (loaded && _tempUrl && !original) {
      await schedule();
      window.URL.revokeObjectURL(_tempUrl);
    }
  }


  __renameInputChanged(event) {
    const {value}            = event.detail;
    const {name}             = event.model.item;
    this._newFileNames[name] = value;
  }
  // listen for data changes
  // resolve the promise when the 
  // file item has an optimized prop
  __waitForCloudProcessing(name) {
    return new Promise(resolve => {
      listen(this, 'data-changed', (event, key) => {
        const {optimized} = event.detail[name];
        if (optimized) { // only present after processing
          unlisten(key);
          resolve();
        }
      });
    });    
  }


  async __delete(name) { 
    const {optimized, original, path, type} = this._dbData[name];
    // an image that has been uploaded but not yet optimized
    if (type && type.includes('image') && original && !optimized) {
      await this.__waitForCloudProcessing(name);
    }
    if (path) {
      await this.__deleteStorageFiles(path);
    }
    return this.__deleteDbFileData(name);
  }

  // update index props based on the drag-drop-list order
  __addIndexes(data) {
    // drag-drop-list elements
    const sortedItems = this.selectAll('.sortable').
                          filter(el => isDisplayed(el)).
                          map(el => el.item);

    const keys = Object.keys(data);
    // use the position in the sortedItems array as new index
    const indexedData = keys.map(key => {
      const obj   = data[key];
      const index = sortedItems.findIndex(item => 
                      item.name === obj.name);
      return {...obj, index};
    });
    // current items data
    const sorted   = indexedData.filter(obj => obj.index > -1);
    // new items data
    const unsorted = indexedData.filter(obj => obj.index === -1);
    // add initial indexes for new data starting 
    // where the current data leaves off
    const startIndex     = sorted.length;
    const orderedNewData = unsorted.map((obj, index) => {
      const newIndex = startIndex + index;
      return {...obj, index: newIndex};
    });
    // merge current and new data
    const ordered = [...sorted, ...orderedNewData];
    // from array back to a data obj
    return ordered.reduce((accum, obj) => {
      accum[obj.name] = obj;
      return accum;
    }, {});
  }


  __saveFileData(obj = {}) {
    const data = this._dbData ? 
                   {...this._dbData, ...obj} : // merge with existing data
                   obj; // set new data

    const orderedData = this.__addIndexes(data);
    
    return services.set({
      coll: this.coll,
      doc:  this.doc,
      data: {
        [this.field]: orderedData
      }
    });
  }


  async __addNewItems(files) {
    const newItems = files.reduce((accum, file) => {
      const {name, newName, size, _tempUrl = null, type} = file;
      const sizeStr = formatFileSize(size);
      const words   = name.split('.');
      const ext     = words[words.length - 1];
      accum[newName] = {
        coll:     this.coll,
        doc:      this.doc,
        ext,
        field:    this.field,
        filename: name, 
        name:     newName, 
        size, 
        sizeStr,
        _tempUrl, 
        type
      };
      return accum;
    }, {});

    if (!this.multiple) {
      // delete previous file and its data
      if (this._items && this._items.length) {
        const {name} = this._items[this._items.length - 1];
        await this.__delete(name);        
      }
    }

    this.__saveFileData(newItems);
  }


  __handleFileSaved(event) {
    const {name, original, path} = event.detail;

    this.__saveFileData({
      [name]: {...this._dbData[name], original, path} // merge with existing file data
    });
  }


  async __saveFileNamesButtonClicked() {
    try {
      await this.clicked();
      const renamedFiles = this._filesToRename.map(file => {
        if (this._newFileNames[file.name]) {
          file.newName = this._newFileNames[file.name];
        }
        else {
          file.newName = nameFromFileName(file.name);
        }
        return file;
      });
      this.__addNewItems(renamedFiles);
      this.$.fileDropZone.addFiles(renamedFiles);
      await schedule();       
      await this.$.renameFilesModal.close();
      this._filesToRename = undefined;
      this._newFileNames  = {};
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }


  async __dismissRenameFilesModalButtonClicked() {
    try {
      await this.clicked();
      const files = this._filesToRename.map(file => {
        file.newName = nameFromFileName(file.name);
        return file;
      });
      this.__addNewItems(files);
      this.$.fileDropZone.addFiles(files);
      await schedule();       
      await this.$.renameFilesModal.close();
      this._filesToRename = undefined;
      this._newFileNames  = {};
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }


  async __handleFilesAdded(event) {
    const {files} = event.detail;
    // drives modal repeater       
    this._filesToRename = files.map(file => {
      if (file.type.includes('image')) { 
        file._tempUrl = window.URL.createObjectURL(file);
      }
      return file;
    });
    await schedule();
    this.$.renameFilesModal.open();
  }


  __handleSortFinished() {
    if (this._itemToDelete) {
      this._targetToDelete.style.opacity = '0';
    }
    this.__saveFileData(); // save new indexes after resort
  }

  // fake deleting the element to play nicely with drag-drop-list
  __hideSortableElement(name) {
    const elements = this.selectAll('.sortable');
    const element  = elements.find(element => 
      element.item && element.item.name === name);
    if (!element) { return; }
    element.classList.remove('sortable');
    element.style.display = 'none';
    return element;
  }

  // from file upload progress 'X' button
  async __handleFileRemoved(event) {
    try {
      await this.$.spinner.show('Deleting file data...');      
      const {name}  = event.detail;
      const element = this.__hideSortableElement(name);
      if (!element) { return; }
      await this.__delete(name);
    }
    catch (error) {
      console.error(error);
    }
    finally {
      this.$.spinner.hide();
    }
  }


  __deleteStorageFiles(path) {
    // lookup the file data item using path and get its type
    const {type} = 
      Object.values(this._dbData).find(obj => 
        obj.path === path);
    // test the file type, 
    // if its an image, 
    // then delete the optim_ and 
    // thumb_ files from storage as well
    if (type && type.includes('image')) {
      const paths    = getImageFileDeletePaths(path);
      const promises = paths.map(path => services.deleteFile(path));
      return Promise.all(promises);
    }

    return services.deleteFile(path);
  }


  __deleteDbFileData(name) {
    return services.deleteField({
      coll:   this.coll, 
      doc:    this.doc, 
      field: `${this.field}.${name}`
    });
  }

  // drag-drop delete area modal
  async __confirmDeleteButtonClicked() {
    try {
      await this.clicked();
      await this.$.spinner.show('Deleting file data...');
      const files  = this.$.fileDropZone.getFiles();
      const {name} = this._itemToDelete;
      const fileToDelete = files.find(file => file.newName === name);
      if (fileToDelete) { // cancel upload and remove file from dropzone list
        this.$.fileDropZone.removeFile(fileToDelete);
      }       
      await this.$.deleteConfirmModal.close();     
      await this.__delete(name);
    }
    catch (error) {
      if (error === 'click disabled') { return; }
      console.error(error);
    }
    finally {
      this.__hideSortableElement(this._itemToDelete.name);
      this._targetToDelete.style.opacity = '1';
      this._targetToDelete = undefined;
      this._itemToDelete   = undefined;
      this.$.spinner.hide();
    }
  }


  async __dismissDeleteConfirmButtonClicked() {
    try {
      await this.clicked();
      this._targetToDelete.style.opacity = '1';
      this._itemToDelete                 = undefined;
      this.$.deleteConfirmModal.close();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
    }
  }
  // see if item was dropped over the delete area
  // compare pointer coordinates with area position
  async __handleDeleteDrop(event) {
    const {data, target}             = event.detail;
    const {x, y}                     = data;
    const {top, right, bottom, left} = this.$.deleteArea.getBoundingClientRect();
    const measurements               = {top, right, bottom, left, x, y};

    if (dropIsOverDeleteArea(measurements)) {
      // show a confirmation modal before deleting
      const {item}           = target;
      const {height, width}  = target.getBoundingClientRect();
      const xCenter          = x - (width / 2);
      const yCenter          = y - (height / 2);
      // override transform to keep item over delete zone
      target.style.transform = `translate3d(${xCenter}px, ${yCenter}px, 1px)`;
      this._targetToDelete   = target;
      this._itemToDelete     = item;
      await schedule();
      this.$.deleteConfirmModal.open();
    }
  }


  async delete(name) {
    if (!name) { 
      throw new Error('file-uploader delete method must have a name argument present.'); 
    }

    try {
      await this.$.spinner.show('Deleting file data...');
      await this.__delete(name);
    }
    catch (error) {
      console.error(error);
      await warn('Sorry, an error occured while trying to delete the file!');
    }
    finally {
      return this.$.spinner.hide();
    }
  }


  async deleteAll() {
    try {
      await this.$.spinner.show('Deleting file data...');
      const names    = Object.keys(this._dbData);
      const promises = names.map(name => this.__delete(name));
      await Promise.all(promises);
      this.$.fileDropZone.reset();
    }
    catch (error) {
      console.error(error);
      await warn('Sorry, an error occured while trying to delete the files!');
    }
    finally {
      return this.$.spinner.hide();
    }
  }


  getData() {
    return this._dbData;
  }

}

window.customElements.define(FileUploader.is, FileUploader);
