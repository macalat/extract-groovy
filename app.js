const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Extract and organize JSON files from the zip
function extractAndOrganizeZip(zipFilePath, extractDir) {
    // Extract the base name of the zip file
    const zipFileName = path.basename(zipFilePath, '.zip');
    // Initialize AdmZip with the provided zip file path
    const zip = new AdmZip(zipFilePath);
    // Extract all entries from the zip file
    zip.extractAllTo(extractDir, true);

    // Create a temporary directory to store all JSON files
    const tempJsonDir = path.join(extractDir, 'temp_json');
    if (!fs.existsSync(tempJsonDir)) {
        fs.mkdirSync(tempJsonDir);
    }

    // Get a list of extracted files
    const extractedFiles = fs.readdirSync(extractDir);

    // Process each extracted file
    extractedFiles.forEach(filename => {
        const filePath = path.join(extractDir, filename);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            // Recursively process subdirectories
            processDirectory(filePath, tempJsonDir);
        } else if (stats.isFile() && filename.endsWith('.json')) {
            // Move JSON files to the temporary directory
            fs.renameSync(filePath, path.join(tempJsonDir, filename));
        } else if (stats.isFile() && !filename.endsWith('.json')) {
            fs.unlink(filePath)
        }
    });

    // Organize JSON files from the temporary directory
    organizeJsonFiles(tempJsonDir, extractDir, zipFileName);

    // Remove empty directories
    removeEmptyDirectories(extractDir);

    // Rename the extracted_files directory to the name of the zip file
    const newExtractDir = path.join(path.dirname(extractDir), zipFileName);
    if (fs.existsSync(newExtractDir)) {
        combineDirectories(extractDir, newExtractDir);
    } else {
        fs.renameSync(extractDir, newExtractDir);
    }

    console.log('Extraction and organization completed for:', zipFilePath);
}

// Remove empty directories recursively
function removeEmptyDirectories(directory) {
    const files = fs.readdirSync(directory);
    files.forEach(file => {
        const filePath = path.join(directory, file);
        if (fs.statSync(filePath).isDirectory()) {
            removeEmptyDirectories(filePath);
        }
    });
    if (fs.readdirSync(directory).length === 0) {
        fs.rmdirSync(directory);
    }
}

// Combine directories recursively
function combineDirectories(sourceDir, destDir) {
    const files = fs.readdirSync(sourceDir);
    files.forEach(file => {
        const sourcePath = path.join(sourceDir, file);
        const destPath = path.join(destDir, file);
        if (fs.statSync(sourcePath).isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath);
            }
            combineDirectories(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
            fs.unlinkSync(sourcePath);
        }
    });
    fs.rmdirSync(sourceDir);
}

// Organize JSON files into appropriate folders
function organizeJsonFiles(tempJsonDir, extractDir) {
    // Create directories for different file types
    const directories = ['BATCH', 'TRANSACTION', 'TRIGGER', 'UTILITY'];
    directories.forEach(directory => {
        const dirPath = path.join(extractDir, directory);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath);
        }
    });

    // Get a list of JSON files in the temporary directory
    const jsonFiles = fs.readdirSync(tempJsonDir);

    // Move JSON files to appropriate folders based on their filenames
    jsonFiles.forEach(filename => {
        const sourcePath = path.join(tempJsonDir, filename);
        const jsonData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const sources = jsonData.sources;
        for (const id in sources) {
            if (sources.hasOwnProperty(id)) {
                const code = Buffer.from(sources[id].code, 'base64').toString('utf8');
                let destDirectory;
                if (filename.startsWith('BATCH')) {
                    destDirectory = path.join(extractDir, 'BATCH');
                } else if (filename.startsWith('TRANSACTION')) {
                    const transactionName = getTransactionOrTriggerName(filename);
                    destDirectory = path.join(extractDir, 'TRANSACTION', transactionName);
                } else if (filename.startsWith('TRIGGER')) {
                    const triggerName = getTransactionOrTriggerName(filename);
                    destDirectory = path.join(extractDir, 'TRIGGER', triggerName);
                } else if (filename.startsWith('UTILITY')) {
                    destDirectory = path.join(extractDir, 'UTILITY');
                }
                if (destDirectory) {
                    if (!fs.existsSync(destDirectory)) {
                        fs.mkdirSync(destDirectory, { recursive: true });
                    }
                    const destPath = path.join(destDirectory, `${filename.replace('.json', '.groovy')}`);
                    fs.writeFileSync(destPath, code);
                }
            }
        }
        // Remove the original file after extracting code
        fs.unlinkSync(sourcePath);
    });

    // Remove the temporary directory
    fs.rmSync(tempJsonDir, { recursive: true });
}

// Extract transaction or trigger name from filename
function getTransactionOrTriggerName(filename) {
    const hyphenIndices = [];
    for (let i = 0; i < filename.length; i++) {
        if (filename[i] === '-') {
            hyphenIndices.push(i);
        }
    }
    if (hyphenIndices.length >= 2) {
        const start = hyphenIndices[0] + 1;
        const end = hyphenIndices[1];
        return filename.substring(start, end);
    }
    return '';
}

// Recursively process a directory and its subdirectories
function processDirectory(dirPath, tempJsonDir) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            processDirectory(filePath, tempJsonDir);
            // Remove the directory if it's empty after processing
            if (fs.readdirSync(filePath).length === 0) {
                fs.rmdirSync(filePath);
            }
        } else if (stats.isFile()) {
            if (file.endsWith('.json')) {
                // Move JSON files to the temporary directory
                fs.renameSync(filePath, path.join(tempJsonDir, file));
            } else {
                // Remove the file if it does not end with .json
                fs.unlinkSync(filePath);
            }
        }
    });
}

// Main function
function main(inputPath) {
    const stats = fs.statSync(inputPath);
    if (stats.isDirectory()) {
        // Process all zip files in the directory
        const files = fs.readdirSync(inputPath);
        files.forEach(file => {
            const filePath = path.join(inputPath, file);
            const fileStats = fs.statSync(filePath);
            if (fileStats.isFile() && file.endsWith('.zip')) {
                // Create a temporary directory to extract the zip contents
                const extractDir = path.join(inputPath, 'extracted_files');
                if (!fs.existsSync(extractDir)) {
                    fs.mkdirSync(extractDir);
                }
                // Extract and organize the zip contents
                extractAndOrganizeZip(filePath, extractDir);
            }
        });
    } else if (stats.isFile()) {
        if (inputPath.endsWith('.zip')) {
            // Create a temporary directory to extract the zip contents
            const extractDir = path.join(path.dirname(inputPath), 'extracted_files');
            if (!fs.existsSync(extractDir)) {
                fs.mkdirSync(extractDir);
            }
            // Extract and organize the zip contents
            extractAndOrganizeZip(inputPath, extractDir);
        }
    } else {
        console.error('Invalid input. Please provide a valid zip file or directory path.');
    }
}

// Usage: node app.js <path_to_zip_file_or_directory>
const inputPath = process.argv[2];
if (!inputPath) {
    console.error('Please provide the path to the zip file or directory.');
    process.exit(1);
}

// Call the main function with the provided input path
main(inputPath);
