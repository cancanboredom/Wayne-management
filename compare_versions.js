import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dir1 = '/Users/cancaneus_/Desktop/Wayne-management-main/Oat_version_21_12/Wayne-management-main';
const dir2 = '/Users/cancaneus_/Desktop/Wayne-management-main';

const ignoreList = ['node_modules', '.git', 'dist', 'Oat_version_21_12', 'Oat version 18.33', 'logic from claude', '.idea', '.vscode', 'wayne_duty.db', '.gemini', 'package-lock.json'];

function getFiles(dir, relativePath = '') {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (ignoreList.includes(file) || file.endsWith('.zip')) {
            return;
        }
        const fullPath = path.join(dir, file);
        const relPath = path.join(relativePath, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(fullPath, relPath));
        } else {
            results.push(relPath);
        }
    });
    return results;
}

const files1 = getFiles(dir1);
const files2 = getFiles(dir2);

const allFiles = new Set([...files1, ...files2]);

const differences = [];

allFiles.forEach(file => {
    // Exclude the compare script itself
    if (file === 'compare_versions.js') return;

    const path1 = path.join(dir1, file);
    const path2 = path.join(dir2, file);

    const exists1 = fs.existsSync(path1);
    const exists2 = fs.existsSync(path2);

    if (exists1 && !exists2) {
        differences.push({ file, status: 'Only in Oat 21.12 (Deleted in Mine)' });
    } else if (!exists1 && exists2) {
        differences.push({ file, status: 'Only in Mine (New)' });
    } else {
        const hash1 = crypto.createHash('sha256').update(fs.readFileSync(path1)).digest('hex');
        const hash2 = crypto.createHash('sha256').update(fs.readFileSync(path2)).digest('hex');
        if (hash1 !== hash2) {
            differences.push({ file, status: 'Modified' });
        }
    }
});

console.log('| File | Status |');
console.log('|---|---|');
differences.forEach(diff => {
    console.log(`| ${diff.file.replace(/\\/g, '/')} | ${diff.status} |`);
});
