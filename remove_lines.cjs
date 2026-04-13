const fs = require('fs');
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
// Find the line with "// --- Main Application ---"
const startIdx = lines.findIndex(l => l.includes('// --- Main Application ---'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('export default function App() {'));

if (startIdx !== -1 && endIdx !== -1) {
  // We want to keep up to startIdx, and from endIdx onwards
  const newLines = [...lines.slice(0, startIdx + 1), '', ...lines.slice(endIdx)];
  fs.writeFileSync('src/App.tsx', newLines.join('\n'));
  console.log('Successfully removed lines');
} else {
  console.log('Could not find markers', startIdx, endIdx);
}
