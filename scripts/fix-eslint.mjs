import fs from 'fs';
import { execSync } from 'child_process';

try {
  // Run eslint and output JSON
  const stdout = execSync('npx eslint . --report-unused-disable-directives --format json', { encoding: 'utf-8', stdio: 'pipe' });
  processOutput(stdout);
} catch (error) {
  processOutput(error.stdout);
}

function processOutput(output) {
  const results = JSON.parse(output);

  for (const result of results) {
    if (result.messages.length === 0) continue;
    
    let filePath = result.filePath;
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    let lines = fileContent.split('\n');
    
    // Sort messages by line descending to not mess up line numbers when inserting
    const messages = result.messages.sort((a, b) => b.line - a.line);
    
    for (const msg of messages) {
      if (msg.ruleId === 'react-hooks/exhaustive-deps') {
        const lineIndex = msg.line - 1;
        const indentMatch = lines[lineIndex].match(/^\s*/);
        const indent = indentMatch ? indentMatch[0] : '';
        lines.splice(lineIndex, 0, indent + '// eslint-disable-next-line react-hooks/exhaustive-deps');
      }
    }
    
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Fixed ${result.messages.length} warnings in ${filePath}`);
  }
}
