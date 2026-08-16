import fs from 'fs';
import path from 'path';

const src1 = 'C:/Users/damie/.gemini/antigravity-ide/brain/dda3aa12-fa24-45ea-947a-34bca6df70fe/.user_uploaded/media_1786918401950.jpg';
const src2 = 'C:/Users/damie/.gemini/antigravity-ide/brain/dda3aa12-fa24-45ea-947a-34bca6df70fe/.user_uploaded/media_1786918409989.jpg';

const destDir = path.resolve('screenshots');
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src1, path.join(destDir, 'open_claude_workspace.jpg'));
fs.copyFileSync(src2, path.join(destDir, 'open_claude_artifacts_preview.jpg'));

console.log('Successfully copied screenshots into screenshots/');
