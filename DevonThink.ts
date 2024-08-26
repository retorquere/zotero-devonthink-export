declare const Zotero: any
declare const OS: any

// Components.utils.import("resource://gre/modules/FileUtils.jsm");

const ROOT = [ 'Downloads', 'My Library' ]

type Collection = {
  type: 'collection' | 'item'
  name: string
  key: string
  children: Collection[]

  path: string[]
}

function debug(msg) {
  if (typeof msg !== 'string') msg = JSON.stringify(msg)
  Zotero.debug(`DevonThink: ${msg}`)
}

class Collections {
  private saved: Set<string> = new Set

  public collection: Record<string, Collection> = {
    $: {
      type: 'collection',
      name: '',
      key: '',
      children: [],
      path: [],
    }
  }

  constructor() {
    let coll
    while (coll = Zotero.nextCollection()) {
      this.collection.$.children.push(this.walk({
        type: 'collection',
        name: coll.name,
        key: coll.primary?.key || coll.key,
        children: coll.descendents || coll.children,
        path: [], // dummy
      }))
    }
  }

  walk(collection: Collection, parent: string[] = []) {
    this.collection[collection.key] = collection
    collection.path = [ ...parent, collection.name ].filter(_ => _)

    for (const child of collection.children) {
      if (child.type === 'collection') {
        this.walk(child, collection.path)
      }
    }
    return collection
  }

  clean(...filenames: string[]): string[] {
    return filenames.map(filename => (filename || '').replace(/[\/\\:*?"<>|$%]/g, ch => encodeURIComponent(ch))).filter(_ => _)
  }

  split(filename) {
    const dot = filename.lastIndexOf('.')
    return (dot < 1 || dot === (filename.length - 1)) ? [ filename, '' ] : [ filename.substring(0, dot), filename.substring(dot) ]
  }

  item(item) {
    let table = '<table>'
    for (let [ field, value ] of Object.entries(item)) {
      switch (field) {
        case 'notes':
        case 'attachments':
          continue
      }
      table += `<tr><td>${ field }</td></tr>`
    }
    table += '</table>'
    return table
  }

  public save(item, save) {
    if (!item.itemType.match(/^(note|attachment)$/)) item.itemType = 'item'
    const folder = item.itemType === 'item' ? item.title : ''
    const attachments = item.itemType === 'attachment' ? [ item ] : (item.attachments || [])
    const notes = item.itemType === 'note' ? [ item ] : (item.notes || []).map(note => ({ ...note, folder }))

    const collections = (item.collections || []).map(key => this.collection[key]).filter(_ => _)
    if (!collections.length) collections.push(this.collection.$) // if the item is not in a collection, save it in the root.

    if (item.itemType === 'item') notes.push({ ...item, note: this.item(item) })

    if (Zotero.getOption('exportFileData')) {
      for (const att of attachments) {
        let base: string, ext: string

        let subdir = ''
        if (att.linkMode === 'linked_url') {
          base = att.title || 'URL'
          ext = '.webloc'
        }
        else if (att.filename) {
          [ base, ext ] = this.split(att.filename)
          if (att.contentType === 'text/html') subdir = base
        }
        else {
          continue
        }

        for (const coll of collections) {
          const parts = this.clean(...coll.path, folder, subdir, base)
          const path = parts.join('/')

          let filename = `${path}${ext}`
          let postfix = 0
          while (this.saved.has(filename.toLowerCase())) {
            filename = `${path}_${++postfix}${ext}`
          }
          this.saved.add(filename.toLowerCase())

          if (att.linkMode === 'linked_url') {
            filename = parts.pop()
            if (postfix) filename += `_${postfix}`
            filename += ext
            save(this.clean(...ROOT, ...coll.path, folder), filename, `{ URL = "${ att.url }"; }`)
          }
          else {
            att.saveFile(filename, true)
          }
          Zotero.write(`${filename}\n`)
        }
      }
    }

    for (const note of notes) {
      if (Zotero.getOption('exportNotes') || note.itemType === 'item') {
        for (const coll of collections) {
          let body: Document | Element = new DOMParser().parseFromString(note.note, 'text/html')
          body = body.querySelector('body') || body
          if (!body.firstChild) continue
          if (body.firstChild instanceof Element && body.firstChild.tagName === 'DIV' && body.firstChild.getAttribute('data-schema-version') && body.children.length === 1) body = body.firstChild

          let basename: string
          if (note.itemType === 'item') {
            basename = note.title || 'item'
          }
          else {
            basename = body.firstChild instanceof Element && body.firstChild.tagName.match(/^(P|H1)$/) && body.firstChild.textContent
            ? body.firstChild.textContent
            : 'note'
          }

          const parts = this.clean(...ROOT, ...coll.path, note.folder, basename)
          const path = parts.join('/')
          let filename = `${path}.html`
          let postfix = 0
          while (this.saved.has(filename.toLowerCase())) {
            filename = `${path}_${++postfix}.html`
          }
          this.saved.add(filename.toLowerCase())
          Zotero.write(`${filename}\n`)

          filename = parts.pop()
          if (postfix) filename += `_${postfix}`
          filename += '.html'

          save(this.clean(...ROOT, ...coll.path, note.folder), filename, note.note)
        }
      }
    }
  }
}

function doExport() {
  const collections = new Collections

  const save = (folder: string[], filename: string, body: string) => {
    debug({ folder, filename })
    // create parent folder as a side effect
    const file = this.FileUtils.getDir('Home', folder, true, false)
    file.append(filename)
    if (file.exists()) file.remove(null)

    const fos = this.Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(this.Components.interfaces.nsIFileOutputStream)
    // eslint-disable-next-line no-bitwise
    fos.init(file, 0x02 | 0x08 | 0x20, 0o664, 0) // write, create, truncate

    const os = this.Components.classes['@mozilla.org/intl/converter-output-stream;1'].createInstance(this.Components.interfaces.nsIConverterOutputStream)
    os.init(fos, 'UTF-8', 4096, '?'.charCodeAt(0))
    os.writeString(body)
    os.close()

    fos.close()
  }

  let item
  while ((item = Zotero.nextItem())) {
    collections.save(item, save)
  }
}
