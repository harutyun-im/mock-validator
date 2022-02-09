import diff from 'deep-diff';
import promptSync from 'prompt-sync';
import terminal from 'terminal-kit';
import path from 'path';
import fs from 'fs';


let term = terminal.terminal ;
let prompt = promptSync();

let updatedFiles = [];
let filesWithDiffs = [];

// process.argv[2] = src/mock_data/qa5/
let mockFiles = fs.readdirSync(process.argv[2]);
// process.argv[3] = src/real_data/qa5/
let realFiles = fs.readdirSync(process.argv[3]);


// make action names from deep-diff user friendly
let actionName = {
    "E": "Property was modified",    
    "N": "Property was newly added",
    "D": "Property was deleted",
    "A": "Changes within an array" 
};


// "fansight-tab"
let exceptKeys = ["testRunId", "userAgent",  "user-agent", "cookie", 
 "date", "timestamp", "content-security-policy", "content-length",
"session", "set-cookie", "id", "etag"];


/**
 * 
 * @param {*} pathArr array containing properties of the path
 * @returns path with "." delimiter
 */
let createJsonPath = (pathArr) => {
    let jsonPath =  pathArr.reduce(function (previousValue, currentValue) {
        return (typeof(currentValue) == 'number') ? previousValue.slice(0,-1).concat(
            `[${currentValue}].`) : previousValue.concat(`${currentValue}.`);;
    } , '');
    return jsonPath.slice(0, -1);
}


/**
 * 
 * @param {*} mock data
 * @param {*} diff is the result of diff.diff function on mock and real data
 * @returns new more readable array
 */
function constructDiffJson(mock, diff) {
    let mockApis = mock.apis;
    let conJsonArr = [];

    for (let i=0; i<mockApis.length; i++) {
        conJsonArr.push({"api": {
            "url": mockApis[i].request.url,
            "method": mockApis[i].request.method
            },
            "diff": [],
            "request": [],
            "response": []
        })
    }
    for (let i=0; i<diff.length; i++) {  
        // filter exception properties      
        if (! diff[i].path.some(e => exceptKeys.includes(e))) {
            conJsonArr[diff[i].path[1]].diff.push({
                "action": actionName[diff[i].kind],
                "path": createJsonPath(diff[i].path),
                "mock": diff[i].lhs,
                "real": diff[i].rhs
            });
                // separate request and response paths
                if (diff[i].path.includes("request")) {
                    conJsonArr[diff[i].path[1]].request.push(
                        createJsonPath(diff[i].path.slice(diff[i].path.indexOf('request')+1)));
                }
                if (diff[i].path.includes("response")) {
                    conJsonArr[diff[i].path[1]].response.push(
                        createJsonPath(diff[i].path.slice(diff[i].path.indexOf('response')+1)));
                }
        }
    } 
    return conJsonArr;
}


/**
 *  
 * @param { 
 * } diffBody is the result of diff.diff function on mock and real data of a body
 * @returns new more readable array
 */
function constructDiffJsonBody(diffBody) {
    let diffArrBody = [];
    for (let i=0; i<diffBody.length; i++) {        
        diffArrBody.push({
            "action": actionName[diffBody[i].kind],
            "path": diffBody[i].path,
            "mock": diffBody[i].lhs,
            "real": diffBody[i].rhs
        });
            /* if action is changes within array and body has an item
            call the function recursively for an item */
        if ("item" in diffBody[i]) {
            let diffBodyItemArr = [];
            diffBodyItemArr.push(diffBody[i].item);
            // create json from body new item recursively
            let diffItem = constructDiffJsonBody(diffBodyItemArr);
            diffArrBody.push({"item": diffItem});
        }            
    } 
    return diffArrBody;
}


/**
 * creates a table by selected properties
 * @param {*} headers of table
 * @param {*} w width
 */
let createTable = function (headers, w) {
    term.table(headers , 
        {
        hasBorder: true ,
        contentHasMarkup: true ,
        borderChars: 'lightRounded' ,
        borderAttr: { color: 'blue' } ,
        textAttr: { bgColor: 'default' } ,
        // firstCellTextAttr: { bgColor: 'blue' } ,
        firstRowTextAttr: { bgColor: 'grey' } ,
        // firstColumnTextAttr: { bgColor: 'red' } ,
        width: w ,
        fit: true   // Activate all expand/shrink + wordWrap
    }
    ) ;
}


/**
 * creates tables for request, response and body
 * @param {*} arr diff[] property of array constructed from differences
 * containing "action", "path", "mock" and "real" properties
 */
function showDiffs(arr) {
    let head = [["ACTION", "PATH", "MOCK", "REAL"]];
    for (let j=0; j<arr.length; j++) {
        let bodyPath;
        if (arr[j].path.includes(".body")) {
            bodyPath = arr[j].path
        }
        // create json for body, if it exists in differences
        if (arr[j].path.includes(".body")) {
            /* if "kind": "D" / "Property was deleted"
            or if "kind": "N" / "Property was newly added"
            there is no lhs/rhs or mock/real */
            if (arr[j].action === "Property was deleted" 
            || arr[j].action === "Property was newly added") {
                head.push(
                    [
                        arr[j].action,
                        arr[j].path,
                        " --- ",
                        " --- "
                    ]
                )
            } else {
                // find differences within body
                let differencesBody = diff.diff(JSON.parse(arr[j].mock), JSON.parse(arr[j].real));
                let diffBody = constructDiffJsonBody(differencesBody);
                //  if action type is "A": "Changes within an array" create a table from items
                for (let i=0; i<diffBody.length; i++) {
                    if (diffBody[i].action === "Changes within an array") { 
                        /* need new index z, because if action is "Changes within an array"
                        diffs are shown in the next element of an diffBody array
                        and need to step over one element ++i */                        
                        let z = ++i;                       
                        // iterate in item
                        for (let k=0; k<diffBody[z].item.length; k++) {
                            createJsonPathWhenPropertyWasModified(diffBody[z].item[k], head, bodyPath);
                        }
                    } else {
                        createJsonPathWhenPropertyWasModified(diffBody[i], head, bodyPath);
                    } 
                } 
            }
        } else {
            head.push([
                arr[j].action, 
                arr[j].path, 
                arr[j].mock, 
                arr[j].real]);
        }   
    }
    createTable(head, 120);
}


/**
 * uses createJsonPath function when "Property was modified"
 * @param {*} el nth element of body diff
 * @param {*} h head for creating a table by terminal-kit
 * @param {*} bp path to differences in body
 */
function createJsonPathWhenPropertyWasModified(el, h, bp) {
    if (el.action === "Property was modified") {
        h.push([
            el.action,
            bp + "." + createJsonPath(el.path), 
            JSON.stringify(el.mock), 
            JSON.stringify(el.real)
        ])
    } else {
        h.push([
            el.action,
            bp, 
            JSON.stringify(el.mock), 
            JSON.stringify(el.real)
        ])
    }
}


/**
 * 
 * @param {*} mock data
 * @param {*} real data
 * @param {*} apiId index of api call
 * @param {*} mockFile
 * @returns mock data, same or updated depends on user input
 */
function applyDiffs(mock, real, apiId, mockFile) {
    term.magenta(`For any action please choose the option:\n`) 
    console.log(`Y - Override mock data, N - Skip, no modifications`);

    let act = prompt();

    while (!(['y', 'Y', 'n', 'N'].includes(act))) {
        act = prompt(`Please choose from Y/N: `);
    }  

    switch (act) {
        case 'y': case 'Y':
            mock.apis[apiId] = real.apis[apiId];
            /* in case of mock data updated, add it to the list of updated files
            if it has not been added yet */
            if (!updatedFiles.includes(mockFile)) {
                updatedFiles.push(mockFile);
            }
            break;
        case 'n': case 'N':
            break;
    }

    return mock;
}


/**
 * uses showDiffs and applyDiffs functions depending on user input
 * @param {*} conJsonArr more readable array constructed from mock data
 * and result of diff.diff function on mock and real data
 * @param {*} mock mock data
 * @param {*} real real data
 * @returns mock data, with or without updating
 */
function showApplyDiffs(conJsonArr, mock, real, mockFile) {
    for (let i=0; i < conJsonArr.length; i++) {
        if (conJsonArr[i].diff.length) {
            term.green(`\nURL:    ${conJsonArr[i].api.url}\nMETHOD: ${conJsonArr[i].api.method}\n\n`);
            // create tables for request and response if they are not empty 
            if (conJsonArr[i].request.length != 0) {
                let head1 = [["REQUEST"], [conJsonArr[i].request.join('\n')]];
                createTable(head1, 40);
            }
            if (conJsonArr[i].response.length != 0) {
                let head2 = [["RESPONSE"], [conJsonArr[i].response.join('\n')]];
                createTable(head2, 40);
            }
            term.magenta('\nDo you want to see differences more detailed? [Y/N]\n');
            term.red("Type (Q) for exit")
            term.bgDefaultColor( '\n') ;

            let answer = prompt();

            while (!(["y", "Y", "n", "N", "q", "Q"].includes(answer))) {
                answer = prompt(`Please choose from Y/N/Q: `);
            }  

            switch (answer) {
                case "Y": case "y":
                    showDiffs(conJsonArr[i].diff);
                    break;
                case "Q": case "q":
                    return mock;
                    break;
            }

            /* prompts a user to apply differences, or save the old 
            values after showing either not showing differences */
            mock = applyDiffs(mock, real, i, mockFile);          
        }
    }
    return mock;
}


/**
 * 
 * @param {*} mockF mock data files
 * @param {*} realF files from real API request
 */
function fileHandling(mockF, realF) {

    term.yellow.bold(`\nWARNING: `);
    term.yellow(`PLEASE NOTE, THAT THE TOOL SKIPS VALIDATION FOR THE FOLLOWING KEY/VALUE CHANGES IN STORES API RESULTS: `);
    term.red(`${exceptKeys}\n`);

    for (let i=0; i<realF.length; i++) {
        for (let j=0; j<mockF.length; j++) {
            if (realF[i] === mockF[j]) {
                let mockPath = path.join(process.argv[2], mockF[j]);
                let mock = JSON.parse(fs.readFileSync(mockPath));

                let realPath = path.join(process.argv[3], realF[i]);
                let real = JSON.parse(fs.readFileSync(realPath));              
    
                let deepDiffs = diff.diff(mock, real);
                
                if (deepDiffs) {
                    term.brightWhite(`\nDifferences for `);
                    term.brightBlue.bold(`${mockF[j]}`);
                    term.brightWhite(` MOCK DATA and real API requests\n`);
    
                    let conJson = constructDiffJson(mock, deepDiffs);
                    let updatedData = showApplyDiffs(conJson, mock, real, mockF[j]);

                    // rewrite only mock data that has been modified
                    if (updatedFiles.includes(mockF[j])) {
                        fs.writeFileSync(mockPath, (JSON.stringify(updatedData, null, 4)));
                    }

                } else {
                    console.log("\n\n")
                    term.black.bgWhite(`Skipping `);
                    term.brightBlue.bold.bgWhite(`${mockF[j]}`);
                    term.black.bgWhite(`  MOCK DATA changes, as the mock/real API requests are the same`);
                    console.log("\n\n")
                }            
            }
        }
    }
}


/**
 * 
 * @param {*} upF array of updated files
 */
function printUpdatedFiles(upF) {
    if (upF.length == 0) {
        term.yellow(`\nNo mock data has been updated.\n`);
    } else {
        term.yellow(`\nChanges are applied for the following files:\n`);
        for (let i=0; i<upF.length; i++) {
            term.brightBlue.bold(`${upF[i]}\n`);
        }
    }

    console.log("\nSUGGESTION: Please rerun your exiting test cases affected by this changes to check the updates correctness with MOCK data usage.\n");
}


/**
 * overwrite all data that have differences
 * @param {*} mf mock data
 * @param {*} rf real data
 */
function applyAllDiffs(mf, rf) {
    for (let i=0; i<rf.length; i++) {
        for (let j=0; j<mf.length; j++) {
            if (rf[i] === mf[j]) {
                let mockPath = path.join(process.argv[2], mf[j]);
                let mock = JSON.parse(fs.readFileSync(mockPath));

                let realPath = path.join(process.argv[3], rf[i]);
                let real = JSON.parse(fs.readFileSync(realPath));              
    
                let deepDiffs = diff.diff(mock, real);

                if (deepDiffs) {
                    fs.writeFileSync(mockPath, (JSON.stringify(real, null, 4)));
                }
            }
        }
    }
}


/**
 * show mock data that have differences and depending on user input
 * overwrite all data, show and apply diffs or quit without changes
 * @param {*} mf mock files
 * @param {*} rf real files
 */
function previewFilesWithDiffs(mf, rf) {

    for (let i=0; i<rf.length; i++) {
        for (let j=0; j<mf.length; j++) {
            if (rf[i] === mf[j]) {
                let mockPath = path.join(process.argv[2], mf[j]);
                let mock = JSON.parse(fs.readFileSync(mockPath));

                let realPath = path.join(process.argv[3], rf[i]);
                let real = JSON.parse(fs.readFileSync(realPath));              
    
                let deepDiffs = diff.diff(mock, real);

                if (deepDiffs && !filesWithDiffs.includes(mf[j])) {
                    filesWithDiffs.push(mf[j]);
                }
            }
        }
    }
    
    term.yellow(`\nThe following mock data have differences with real data:`)

    for (let f=0; f<filesWithDiffs.length; f++) {
        term.brightBlue.bold(`\n${filesWithDiffs[f]}`);
    }

    console.log(`\n\nPlease choose from the options:
    Y - show differences
    A - apply all differences
    Q - quit
    `);
    let p = prompt();

    while (!(["y", "Y", "a", "A", "q", "Q"].includes(p))) {
        p = prompt(`Please choose from Y/A/Q: `);
    }

    switch(p) {
        case "Y": case "y":
            fileHandling(mf, rf);
            printUpdatedFiles(updatedFiles);
            break;
        case "A": case "a":
            applyAllDiffs(mf, rf);
            break;
        case "Q": case "q":
            break;
    }

}


previewFilesWithDiffs(mockFiles, realFiles);
