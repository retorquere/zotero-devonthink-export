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
  "lastUpdated": "2024-08-22 23:07:42"
}

// Components.utils.import("resource://gre/modules/FileUtils.jsm");
const ROOT = ['Downloads', 'My Library'];
function debug(msg) {
    Zotero.debug(`DevonThink: ${msg}`);
}
class Collections {
    constructor() {
        var _a;
        this.saved = new Set;
        this.collection = {
            $: {
                type: 'collection',
                name: '',
                key: '',
                children: [],
                path: [],
            }
        };
        let coll;
        while (coll = Zotero.nextCollection()) {
            this.collection.$.children.push(this.walk({
                type: 'collection',
                name: coll.name,
                key: ((_a = coll.primary) === null || _a === void 0 ? void 0 : _a.key) || coll.key,
                children: coll.descendents || coll.children,
                path: [], // dummy
            }));
        }
        debug(JSON.stringify(this.collection.$, null, 2));
    }
    walk(collection, parent = []) {
        this.collection[collection.key] = collection;
        collection.path = [...parent, collection.name].filter(_ => _);
        for (const child of collection.children) {
            if (child.type === 'collection') {
                this.walk(child, collection.path);
            }
        }
        return collection;
    }
    clean(...filenames) {
        return filenames.map(filename => filename.replace(/[\x00-\x1F\x7F\/\\:*?"<>|$%]/g, encodeURIComponent)).filter(_ => _);
    }
    split(filename) {
        const dot = filename.lastIndexOf('.');
        return (dot < 1 || dot === (filename.length - 1)) ? [filename, ''] : [filename.substring(0, dot), filename.substring(dot)];
    }
    save(item, saveNote) {
        const folder = item.itemType === 'note' ? '' : item.title;
        const attachments = item.itemType === 'attachment' ? [item] : (item.attachments || []);
        const notes = item.itemType === 'note' ? [item] : (item.notes || []);
        const collections = (item.collections || []).map(key => this.collection[key]).filter(_ => _);
        if (!collections.length)
            collections.push(this.collection.$); // if the item is not in a collection, save it in the root.
        if (Zotero.getOption('exportFileData')) {
            for (const att of attachments) {
                if (!att.defaultPath)
                    continue;
                const [base, ext] = this.split(att.filename);
                const subdir = att.contentType === 'text/html' ? base : '';
                for (const coll of collections) {
                    const path = this.clean(...coll.path, folder, subdir, base).join('/');
                    let filename = `${path}${ext}`;
                    let postfix = 0;
                    while (this.saved.has(filename.toLowerCase())) {
                        filename = `${path}_${++postfix}${ext}`;
                    }
                    this.saved.add(filename.toLowerCase());
                    att.saveFile(filename, true);
                    Zotero.write(`${filename}\n`);
                }
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
                    let basename = body.firstChild instanceof Element && body.firstChild.tagName.match(/^(P|H1)$/) && body.firstChild.textContent ? body.firstChild.textContent : 'note';
                    const path = this.clean(...ROOT, ...coll.path, folder, basename).join('/');
                    let filename = `${path}.html`;
                    let postfix = 0;
                    while (this.saved.has(filename.toLowerCase())) {
                        filename = `${path}_${++postfix}.html`;
                    }
                    this.saved.add(filename.toLowerCase());
                    Zotero.write(`${filename}\n`);
                    if (postfix)
                        basename += `_${postfix}`;
                    saveNote(this.clean(...ROOT, ...coll.path, folder), `${basename}.html`, note.note);
                }
            }
        }
    }
}
function doExport() {
    const collections = new Collections;
    const saveNote = (folder, filename, body) => {
        // create parent folder as a side effect
        const file = this.FileUtils.getDir('Home', folder, true, false);
        file.append(filename);
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