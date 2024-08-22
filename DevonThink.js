{
  "translatorID": "75bfd6cc-026f-4f2d-bfc9-72396af665db",
  "label": "DevonThink",
  "description": "Export files and notes according to collection organisation",
  "creator": "Emiliano Heyns",
  "target": "txt",
  "minVersion": "4.0.27",
  "maxVersion": "",
  "configOptions": {
    "getCollections": true
  },
  "displayOptions": {
    "exportNotes": true,
    "exportFileData": true
  },
  "translatorType": 2,
  "browserSupport": "gcsv",
  "priority": 100,
  "inRepository": false,
  "lastUpdated": "2024-08-22 17:03:43"
}

const ROOT = '/Users/emile/Downloads';
function debug(msg) {
    Zotero.debug(`DevonThink: ${msg}`);
}
class Collections {
    constructor() {
        this.path = {};
        this.saved = new Set;
        let coll;
        while (coll = Zotero.nextCollection()) {
            this.register(coll);
        }
    }
    join(...p) {
        return p.filter(_ => _).join('/');
    }
    register(collection, path) {
        const key = (collection.primary ? collection.primary : collection).key;
        const children = collection.children || collection.descendents || [];
        const collections = children.filter(coll => coll.type === 'collection');
        const name = this.clean(collection.name);
        this.path[key] = this.join(path, name);
        for (collection of collections) {
            this.register(collection, this.path[key]);
        }
    }
    clean(filename) {
        return filename.replace(/[\x00-\x1F\x7F\/\\:*?"<>|$%]/g, encodeURIComponent);
    }
    split(filename) {
        const dot = filename.lastIndexOf('.');
        return (dot < 1 || dot === (filename.length - 1)) ? [filename, ''] : [filename.substring(0, dot), filename.substring(dot)];
    }
    save(item, saveNote) {
        const attachments = (item.itemType === 'attachment') ? [item] : (item.attachments || []);
        const notes = (item.itemType === 'note') ? [item] : (item.notes || []);
        let collections = (item.collections || []).map(key => this.path[key]).filter(coll => coll);
        if (!collections.length)
            collections = ['']; // if the item is not in a collection, save it in the root.
        for (const att of attachments) {
            if (!att.defaultPath)
                continue;
            const [base, ext] = this.split(this.clean(att.filename));
            const subdir = att.contentType === 'text/html' ? base : '';
            for (const coll of collections) {
                const path = this.join(coll, subdir, base);
                let filename = `${path}${ext}`;
                let postfix = 0;
                while (this.saved.has(filename.toLowerCase())) {
                    filename = `${path}_${++postfix}${ext}`;
                }
                this.saved.add(filename.toLowerCase());
                if (Zotero.getOption('exportFileData'))
                    att.saveFile(filename, true);
                Zotero.write(`${filename}\n`);
            }
        }
        if (Zotero.getOption('exportNotes')) {
            for (const note of notes) {
                for (const coll of collections) {
                    let body = new DOMParser().parseFromString(note.note, 'text/html');
                    body = body.querySelector('body') || body;
                    if (!body.firstChild)
                        continue;
                    if (body.firstChild instanceof Element && body.firstChild.tagName === 'DIV' && body.firstChild.getAttribute('data-schema-version') && body.children.length === 1)
                        body = body.firstChild;
                    const title = this.clean(body.firstChild instanceof Element && body.firstChild.tagName.match(/^(P|H1)$/) && body.firstChild.textContent ? body.firstChild.textContent : 'note');
                    const path = this.join(ROOT, coll, title);
                    let filename = `${path}.html`;
                    let postfix = 0;
                    while (this.saved.has(filename.toLowerCase())) {
                        filename = `${path}_${++postfix}.html`;
                    }
                    this.saved.add(filename.toLowerCase());
                    saveNote(filename, note.note);
                }
            }
        }
    }
}
function doExport() {
    if (!Zotero.getOption('exportFileData'))
        throw new Error('DevonThink needs "Export File Data" to be on');
    const collections = new Collections;
    const saveNote = (filename, body) => {
        // Components.utils.import("resource://gre/modules/FileUtils.jsm");
        const file = new this.FileUtils.File(filename);
        if (file.exists())
            file.remove(null);
        const fos = this.Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(this.Components.interfaces.nsIFileOutputStream);
        // eslint-disable-next-line no-bitwise
        fos.init(file, 0x02 | 0x08 | 0x20, 0o664, 0); // write, create, truncate
        const os = this.Components.classes['@mozilla.org/intl/converter-output-stream;1'].createInstance(this.Components.interfaces.nsIConverterOutputStream);
        os.init(fos, 'UTF-8', 4096, '?'.charCodeAt(0));
        os.writeString(body);
        os.close();
        fos.close();
    };
    let item;
    while ((item = Zotero.nextItem())) {
        collections.save(item, saveNote);
    }
}
