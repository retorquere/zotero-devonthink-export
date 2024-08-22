# zotero-devonthink-export

When installed in Zotero, this translator will allow exporting attachments and notes of items in your Zotero Library or selected collection as files organized in folders. The exported attachments/notes will be organized in folders which reflect the hierarchical structure of your selected Zotero Library/Collections.

**How to install**

1. Download the [DevonThink.js](https://raw.githubusercontent.com/retorquere/zotero-devonthink-export/master/DevonThink.js) file from [zotero-devonthink-export](https://github.com/retorquere/zotero-devonthink-export) GitHub page
2. Edit the ROOT location at the top. This
    * is relative to the user home directory (this cannot be changed)
    * must match the folder you will be exporting to, and
    * if you are exporting attachments, the ROOT must match [ `<the folder you are exporting to>`, `<the filename you chose>` ] (by default this is "My Library" or the collection name you are exporting)
3. Update `lastUpdated` to the current date/time`
3. Move the "DevonThink.js" file to "[User home directory]/Zotero/translators" folder 
4. Restart Zotero 

**How to run**

1. Select and right click your My Library or a collection 
2. Select "Export Library…"
3. Select format “DevonThink” and enable the checkbox for “Export Files” and/or “Export Notes”. Then click *OK*.
4. Select the target location for the export under “Where” **which must match ROOT above** and Save.

**Note:** 

Exported attachments/notes will be duplicated if an item belongs to multiple collections
