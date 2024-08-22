const fs = require('fs')

const translator = require('./package.json').main.replace(/[.][^.]+$/, '')

const body = fs.readFileSync(`${translator}.js`, 'utf-8')
const header = JSON.stringify({
  translatorID: '75bfd6cc-026f-4f2d-bfc9-72396af665db',
  label: 'DevonThink',
  description: 'Export files and notes according to collection organisation',
  creator: 'Emiliano Heyns',
  target: 'txt',
  minVersion: '4.0.27',
  maxVersion: '',
  configOptions: {
    getCollections: true
  },
  displayOptions: {
    exportNotes: true,
    exportFileData: true,
  },
  translatorType: 2,
  browserSupport: 'gcsv',
  priority: 100,
  inRepository: false,
  lastUpdated: fs.statSync(`${translator}.ts`).mtime.toISOString().replace('T', ' ').replace(/\..*/, ''),
}, null, 2)

fs.writeFileSync(`${translator}.js`, header + '\n\n' + body)
