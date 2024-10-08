declare const Zotero: any
declare const VERSION: string

// Components.utils.import("resource://gre/modules/FileUtils.jsm");

const ROOT = [ 'Downloads', 'Exported Items' ]

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

const entity: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}
function html(str: string): string {
  return str.replace(/[<>&"]/g, (c: string) => entity[c])
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

  creator(cr) {
    let tr = '<tr>'
    tr += `<td>${ html(cr.creatorType) }</td>`
    tr += `<td>${ html(cr.name || [cr.lastName, cr.firstName].filter(_ => _).join(', ')) }</td>`
    tr += '</tr>'
    return tr
  }

  item(item): string {
    let table = '<table>'
    for (let [ field, value ] of Object.entries(item)) {
      let encode = true
      switch (field) {
        case 'version':
        case 'notes':
        case 'attachments':
        case 'collections':
        case 'relations':
        case 'uri':
          continue
        case 'title':
          encode = false
          break
        case 'tags':
          value = (value as any[]).map(tag => tag.tag || tag).join(', ')
          break
        case 'creators':
          table += (value as any[]).map(cr => this.creator(cr)).join('')
          continue
      }
      if (typeof value === 'number') value = `${value}`
      if (encode) value = html(value as string)
      if (typeof value !== 'string') {
        value = `hey! ${field} is ${typeof value}`
      }
      table += `<tr><td>${ html(field) }</td><td>${ value }</td></tr>`
    }
    table += '</table>'
    return table
  }

  webloc(item): string {
    const [ , kind, lib, key ] = item.uri.match(/^https?:\/\/zotero\.org\/(users|groups)\/((?:local\/)?[^/]+)\/items\/(.+)/)
    const url = (kind === 'users') ? `zotero://select/library/items/${ key }` : `zotero://select/groups/${ lib }/items/${ key }`
    return `{ URL = "${ url }"; }`
  }

  public save(item, save) {
    if (!item.itemType.match(/^(note|attachment)$/)) item.itemType = 'item'
    const folder = item.itemType === 'item' ? item.title : ''
    const attachments = item.itemType === 'attachment' ? [ item ] : (item.attachments || [])
    const notes = item.itemType === 'note' ? [ item ] : (item.notes || [])

    const collections = (item.collections || []).map(key => this.collection[key]).filter(_ => _)
    if (!collections.length) collections.push(this.collection.$) // if the item is not in a collection, save it in the root.

    if (item.itemType === 'item') {
      notes.push({ ...item, item: this.item(item) })
      notes.push({ ...item, webloc: this.webloc(item) })
    }

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
            Zotero.write(`${filename}\n`)
            att.saveFile(filename, true)
          }
        }
      }
    }

    const ignore = [ '', '', '' ]

    const note2body = (item) => {
      if (item.webloc) return [ 'zotero', item.webloc, '.webloc' ]

      if (item.note || item.item) {
        if (item.note && !Zotero.getOption('exportNotes')) return ignore

        let body: Document | Element = new DOMParser().parseFromString(item.note || item.item, 'text/html')
        body = body.querySelector('body') || body
        if (!body.firstChild) return ignore
        if (body.firstChild instanceof Element && body.firstChild.tagName === 'DIV' && body.firstChild.getAttribute('data-schema-version') && body.children.length === 1) body = body.firstChild
        if (!body.textContent) return ignore

        let basename: string
        if (item.item) {
          basename = item.title || 'item'
        }
        else {
          basename = body.firstChild instanceof Element && body.firstChild.tagName.match(/^(P|H1)$/) && body.firstChild.textContent
          basename = basename || 'note'
        }
        return [ basename, item.note || item.item, '.html' ]
      }
    }

    for (const item of notes) {
      const [ basename, body, ext ] = note2body(item)
      if (!basename) continue

      for (const coll of collections) {
        const parts = this.clean(...ROOT, ...coll.path, folder, basename)
        const path = parts.join('/')

        let filename = `${path}.html`
        let postfix = 0
        while (this.saved.has(filename.toLowerCase())) {
          filename = `${path}_${++postfix}${ext}`
        }
        this.saved.add(filename.toLowerCase())
        Zotero.write(`${filename}\n`)

        filename = parts.pop()
        if (postfix) filename += `_${postfix}`
        filename += ext

        save(this.clean(...ROOT, ...coll.path, folder), filename, body)
      }
    }
  }
}

function doExport() {
  const collections = new Collections

  Zotero.write(`exported with ${VERSION}\n`)

  const save = (folder: string[], filename: string, body: string) => {
    // create parent folder as a side effect
    const file = this.FileUtils.getDir('Home', folder, true, false)
    file.append(filename)
    Zotero.write(file.path)
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
