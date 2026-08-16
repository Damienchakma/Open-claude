import fs from 'fs';
import path from 'path';

const userUploadedDir = 'C:/Users/damie/.gemini/antigravity-ide/brain/dda3aa12-fa24-45ea-947a-34bca6df70fe/.user_uploaded';
const files = fs.readdirSync(userUploadedDir);

const img1 = files.find(f => f.includes('1786918401950'));
const img2 = files.find(f => f.includes('1786918409989'));

const dirs = [path.resolve('screenshots'), path.resolve('public/screenshots'), path.resolve('docs/screenshots')];
dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

if (img1 && img2) {
    const src1 = path.join(userUploadedDir, img1);
    const src2 = path.join(userUploadedDir, img2);

    dirs.forEach(d => {
        fs.copyFileSync(src1, path.join(d, 'open_claude_workspace.jpg'));
        fs.copyFileSync(src2, path.join(d, 'open_claude_artifacts_preview.jpg'));
    });
    console.log('Successfully copied screenshots to:', dirs);
} else {
    console.log('Images not found in .user_uploaded, available files:', files);
}
