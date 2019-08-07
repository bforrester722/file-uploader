/**
 * `preview-list`
 * 
 *  shows file items in a rearrangeable list
 *
 *
 *  properites:
 *
 *  
 *    items - collection of file data objects that drives the template repeater
 *  
 *
 *
 *  events:
 *
 *
 *    'list-item-dropped' - fired any time an item is dropped
 *                          detail: {data (x, y coordinates), target} 
 *
 *    'list-sort-finished' - fired any time the list is sorted
 *
 *  
 *  methods:
 *
 *
 *    hideSortableElement(name) - name (file data name key)
 *                                returns the element newly hidden
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
  isDisplayed, 
  schedule
}                 from '@spriteful/utils/utils.js';
import htmlString from './preview-list.html';
import '@spriteful/cms-icons/cms-icons.js';
import '@spriteful/drag-drop-list/drag-drop-list.js';
import '@spriteful/lazy-video/lazy-video.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-image/iron-image.js';
import './processing-icon.js';


class PreviewList extends SpritefulElement {
  static get is() { return 'preview-list'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

      items: Array,

    };
  }


  __computeSortableClass(type) {
    if (type && type.includes('video')) {
      return 'video';
    }
    return '';
  }


  __computeIronImageHidden(type) {
    if (!type) { return true; }
    return !type.includes('image');
  }


  __computeIronIconHidden(type) {
    if (!type) { return true; }
    return !type.includes('audio');
  }


  __computeLazyVideoHidden(type) {    
    if (!type) { return true; }
    return !type.includes('video');
  }


  __computeImgSrc(item) {
    if (!item) { return '#'; }

    const {original, _tempUrl, thumbnail} = item;

    if (thumbnail) { return thumbnail; }
    if (original)  { return original; }
    return _tempUrl;
  }


  __computeVideoSrc(item) {
    if (!item) { return '#'; }

    const {original, _tempUrl} = item;

    if (original) { return original; }
    return _tempUrl;
  }

  // iron-image on-loaded-changed
  async __handleImageLoadedChanged(event) {
    const {detail, model} = event;
    if (!model.item) { return; }
    const {value: loaded}      = detail;
    const {original, _tempUrl} = model.item;

    if (loaded && _tempUrl && !original) {
      await schedule(); // iron-image workaround
      window.URL.revokeObjectURL(_tempUrl);
    }
  }

  // lazy-video metadata-loaded event handler
  __handleMetadataLoaded(event) {
    const {original, _tempUrl} = event.model.item;
    if (_tempUrl && !original) {
      window.URL.revokeObjectURL(_tempUrl);
    }
  }


  __handleDrop(event) {
    this.fire('list-item-dropped', event.detail);
  }


  __handleSort() {
    this.fire('list-sort-finished');
  }
  // prevent the dragList from collapsing entirely
  // for a few frames, since the template is re-rendered
  async __measureMinHeight() {
    try {
      await this.debounce('file-uploader-preview-list-debounce', 100);
      if (this.items && this.items.length) {
        const {height} = this.$.dragList.getBoundingClientRect();
        this.$.dragList.style['min-height'] = `${height}px`;
      }
      // reset if there are no more items to display
      else {
        this.$.dragList.style['min-height'] = 'unset';
      }
    }
    catch (error) {
      if (error === 'debounced') { return; }
      console.error(error);
    }
  }

  // fake deleting the element to play nicely with drag-drop-list
  hideSortableElement(name) {
    const elements = this.selectAll('.sortable');
    const element  = elements.find(element =>
      !element.item ||
      element.item.name === name
    );
    // reset prior hidden elements
    elements.forEach(el => {
      el.style.display = 'initial';
    });

    if (!element) { return; }
    
    element.classList.remove('sortable');
    element.style.display = 'none';
    return element;
  }
  // used to update indexes
  // return an array that is ordered exactly
  // as represented in the ui
  getListItems() {
    return this.selectAll('.sortable').
             filter(el => isDisplayed(el)).
             map(el => el.item);
  }

}

window.customElements.define(PreviewList.is, PreviewList);
