/**
 * `file-uploader`
 * 
 *  Accepts files from user and handles uploading/saving/optimization/deleting/previewing/rearranging
 *
 *
 *  properites:
 *
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
 *
 *    'data-changed' - fired any time file(s) data changes
 *                     detail -> {[name]: {coll, doc, ext, field, filename, index, name, path, size, sizeStr, type, _tempUrl <, optimized, original, thumbnail>}, ...}
 *                                _tempUrl - window.URL.createObjectURL
 *                                index    - used for multiple files ordering
 *
 *
 *    'file-received' - fired after user interacts with renameFileModal and before the file upload process begins
 *                      detail -> {name, newName, size, type <, _tempUrl>}
 *                                 name     - will become 'filename' (name.ext)
 *                                 newName  - will become unique 'name' key
 *                                 _tempUrl - window.URL.createObjectURL
 *
 *  
 *    'file-uploaded' - fired after successful upload operation
 *                      detail -> {coll, doc, ext, field, filename, name, original, path, size, sizeStr, type, _tempUrl}
 *                                 original - public download url for full size original
 *
 *
 *    'file-deleted' - fired after user deletes a file
 *                     detail -> {coll, doc, ext, field, filename, index, name, path, size, sizeStr, type, _tempUrl <, optimized, original, thumbnail>}
 *
 *     
 *    'upload-cancelled' - fired if user cancels the upload process
 *                         detail -> {coll, doc, ext, field, filename, index, name, path, size, sizeStr, type, _tempUrl}          
 *
 *
 *  
 *  methods:
 *
 *
 *    getData() - returns file data {[name]: {coll, doc, ext, field, filename, index, name, path, size, sizeStr, type, _tempUrl <, optimized, original, thumbnail>}, ...}
 *              
 *
 *    delete(name) - name  -> <String> required: file name to target for delete operation
 *                            returns Promise 
 *                            resolves to {coll, doc, ext, field, filename, index, name, path, size, sizeStr, type, _tempUrl <, optimized, original, thumbnail>}
 *
 *    
 *    deleteAll() - returns Promise that resolves when deletion finishes
 *
 *
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
  deepClone,
  join, 
  map, 
  split
}                 from '@spriteful/lambda/lambda.js';
import {
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
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-image/iron-image.js';
import '@polymer/paper-button/paper-button.js';
import '@polymer/paper-input/paper-input.js';
import './preview-list.js';
import './drag-drop-files.js';


const trim                = str => str.trim();
const toLower             = str => str.toLowerCase();
const removeSpacesAndCaps = compose(trim, split(' '), map(toLower), join(''));


const KILOBYTE = 1024;
const MEGABYTE = 1048576;

const formatFileSize = size => {
  if (size < KILOBYTE) {
    return `${size}bytes`;
  } 
  else if (size >= KILOBYTE && size < MEGABYTE) {
    return `${(size / KILOBYTE).toFixed(1)}KB`;
  } 
  else if (size >= MEGABYTE) {
    return `${(size / MEGABYTE).toFixed(1)}MB`;
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

// update index props based on the drag-drop-list elements order (listItems)
const addIndexes = (data, listItems) => {
  const keys = Object.keys(data);
  // use the position in the listItems array as new index
  const indexedData = keys.map(key => {
    const obj   = data[key];
    const index = listItems.findIndex(item => 
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
};


const deleteStorageFiles = (data, path) => {
  // lookup the file data item using path and get its type
  const {type} = 
    Object.values(data).find(obj => 
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
      // firestore data
      _dbData: Object,

      _filesToRename: Array,
      // drives preview-list repeater
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
      }, [])
      // filter out missing entries caused from deleting items
      .filter(item => item); 

    return items;
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


  __renameInputChanged(event) {
    const {value}            = event.detail;
    const {name}             = event.model.item;
    this._newFileNames[name] = removeSpacesAndCaps(value);
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


  __deleteDbFileData(name) {
    return services.deleteField({
      coll:   this.coll, 
      doc:    this.doc, 
      field: `${this.field}.${name}`
    });
  }


  async __delete(name) {
    // clone to survive deletion and fire with event
    const fileData = {...this._dbData[name]}; 
    const {optimized, original, path, type} = fileData;
    // an image that has been uploaded but not yet optimized
    if (type && type.includes('image') && original && !optimized) {
      await this.__waitForCloudProcessing(name);
    }
    if (path) {
      await deleteStorageFiles(this._dbData, path);
    }
    await this.__deleteDbFileData(name);
    this.fire('file-deleted', fileData);
  }


  __saveFileData(obj = {}) {
    const data = this._dbData ? 
                   {...this._dbData, ...obj} : // merge with existing data
                   obj; // set new data

    // preview-list's drag-drop-list elements
    const listItems = this.$.preview.getListItems();
    // update index props based on the drag-drop-list elements order (listItems)
    const orderedData = addIndexes(data, listItems);
    
    return services.set({
      coll: this.coll,
      doc:  this.doc,
      data: {
        [this.field]: orderedData
      }
    });
  }


  async __addNewFileItems(files) {
    const newItems = files.reduce((accum, file) => {
      const {name, newName, size, type, _tempUrl = null} = file;
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

    this.$.dropZone.addFiles(files);
    this.fire('files-received', {files});

    if (!this.multiple) {
      // delete previous file and its data
      if (this._items && this._items.length) {
        const {name} = this._items[this._items.length - 1];
        await this.__delete(name);        
      }
    }

    return this.__saveFileData(newItems);
  }


  async __handleFileSaved(event) {
    const {name, original, path} = event.detail;
    const fileData = {...this._dbData[name], original, path}; // merge with existing file data
    await this.__saveFileData({[name]: fileData});
    this.fire('file-uploaded', fileData);
  }


  async __resetRenameFilesModal() {
    await schedule();       
    await this.$.renameFilesModal.close();
    this._filesToRename = undefined;
    this._newFileNames  = {};
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
      await this.__addNewFileItems(renamedFiles);
      await this.__resetRenameFilesModal();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
      warn('An error occured while adding files.');
    }
  }


  async __dismissRenameFilesModalButtonClicked() {
    try {
      await this.clicked();
      const files = this._filesToRename.map(file => {
        file.newName = nameFromFileName(file.name);
        return file;
      });
      await this.__addNewFileItems(files);
      await this.__resetRenameFilesModal();
    }
    catch (error) {
      if (error === 'click debounced') { return; }
      console.error(error);
      warn('An error occured while adding files.');
    }
  }


  async __handleFilesAdded(event) {
    const {files} = event.detail;
    // drives modal repeater       
    this._filesToRename = files.map(file => {
      if (file.type.includes('image') || file.type.includes('video')) { 
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

  // from file upload progress 'X' button
  async __handleFileRemoved(event) {
    try {
      await this.$.spinner.show('Deleting file data...');      
      const {name}   = event.detail;
      const element  = this.$.preview.hideSortableElement(name);
      // fire a clone to survive deletion
      const fileData = {...this._dbData[name]};
      this.fire('upload-cancelled', fileData);
      if (!element) { return; }
      await this.__delete(name);
    }
    catch (error) {
      console.error(error);
      await warn('An error occured while cancelling the upload.');
    }
    finally {
      this.$.spinner.hide();
    }
  }

  // drag-drop delete area modal
  async __confirmDeleteButtonClicked() {
    try {
      await this.clicked();
      await this.$.spinner.show('Deleting file data...');
      const files  = this.$.dropZone.getFiles();
      const {name} = this._itemToDelete;
      const fileToDelete = files.find(file => 
                             file.newName === name);
      if (fileToDelete) { // cancel upload and remove file from dropzone list
        this.$.dropZone.removeFile(fileToDelete);
      }       
      await this.$.deleteConfirmModal.close();     
      await this.__delete(name);
    }
    catch (error) {
      if (error === 'click disabled') { return; }
      console.error(error);
    }
    finally {
      this.$.preview.hideSortableElement(this._itemToDelete.name);
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
      this._itemToDelete     = {...item};
      await schedule();
      this.$.deleteConfirmModal.open();
    }
  }


  async delete(name) {
    if (!name) { 
      throw new Error('file-uploader delete method must have a name argument present.'); 
    }
    // clone to survive deletion
    const fileData = {...this._dbData[name]};

    try {
      await this.$.spinner.show('Deleting file data...');
      await this.__delete(name);
    }
    catch (error) {
      console.error(error);
      await warn('Sorry, an error occured while trying to delete the file!');
    }
    finally {
      await this.$.spinner.hide();
      return fileData;
    }
  }


  async deleteAll() {
    try {
      await this.$.spinner.show('Deleting file data...');
      const names    = Object.keys(this._dbData);
      const promises = names.map(name => this.__delete(name));
      await Promise.all(promises);
      this.$.dropZone.reset();
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
    return deepClone(this._dbData);
  }

}

window.customElements.define(FileUploader.is, FileUploader);
