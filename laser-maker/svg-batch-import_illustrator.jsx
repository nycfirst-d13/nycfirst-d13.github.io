#target illustrator

function main() {
    if (app.documents.length === 0) {
        alert("Please open a document before running the script.");
        return;
    }

    var destDoc = app.activeDocument;
    var artboard = destDoc.artboards[destDoc.artboards.getActiveArtboardIndex()];
    var abBounds = artboard.artboardRect; // [left, top, right, bottom]

    var folder = Folder.selectDialog("Select a folder of SVGs to place");

    if (!folder) return;

    var files = folder.getFiles(function(file) {
        return file instanceof File && file.name.match(/\.svg$/i);
    });

    if (files.length === 0) {
        alert("No SVG files found.");
        return;
    }

    // === Grid Settings ===
    var targetWidth = 250;
    var spacingX = 0;
    var spacingY = 0;
    var columns = 8;

    var startX = abBounds[0] + 7;
    var startY = abBounds[1] - 214;

    for (var i = 0; i < files.length; i++) {
        var row = Math.floor(i / columns);
        var col = i % columns;

        var x = startX + col * (targetWidth + spacingX);
        var y = startY - row * (targetWidth + spacingY);

        // Open SVG and copy
        var svgDoc = app.open(files[i]);
        svgDoc.selectObjectsOnActiveArtboard();
        app.copy();
        svgDoc.close(SaveOptions.DONOTSAVECHANGES);

        // Paste into dest doc and position
        app.activeDocument = destDoc;
        app.paste();

        if (app.selection.length > 0) {
            // SVGs may paste as several sibling items — group them so the
            // whole tag scales/moves as one. (Single-item paste groups fine too.)
            if (app.selection.length > 1) app.executeMenuCommand('group');
            var group = app.selection[0];

            // Resize to target width
            var originalWidth = group.width;
            var scaleFactor = targetWidth / originalWidth;
            group.resize(scaleFactor * 100, scaleFactor * 100); // resize uses percent

            // Position
            group.left = x;
            group.top = y;

            // Deselect after placing
            destDoc.selection = null;
        }
    }

    alert("Placed " + files.length + " SVGs into a grid. 2");
}

main();
