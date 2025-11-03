// scripts/copy-abi.js (CJS 独立脚本)

const fs = require('fs');
const path = require('path');

// CJS 模式下的路径计算
const ROOT_DIR = path.join(__dirname, '..'); 

// --- ABI 配置 ---
const ARTIFACTS_BASE_PATH = path.join(ROOT_DIR, 'artifacts', 'contracts');
const FRONTEND_ABI_PATH = path.join(ROOT_DIR, 'demo-web', 'src', 'config', 'abi');

const contractsToCopy = ["ConnectionToken", "ConnectionUserRegistry"];

function copyAbi() {
    console.log("--- Starting Independent ABI Copy Script ---");
    
    if (!fs.existsSync(FRONTEND_ABI_PATH)) {
      fs.mkdirSync(FRONTEND_ABI_PATH, { recursive: true });
      console.log(`Created directory: ${FRONTEND_ABI_PATH}`);
    }
    
    for (const contractName of contractsToCopy) {
      try {
        const artifactPath = path.join(ARTIFACTS_BASE_PATH, contractName + ".sol", contractName + ".json");
        
        if (!fs.existsSync(artifactPath)) {
            console.error(`❌ Artifact file not found for ${contractName}. Run 'npm run compile' first.`);
            continue;
        }

        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        const simplifiedAbi = {
          contractName: contractName,
          abi: artifact.abi // Hardhat 2.x 结构
        };
        
        const destinationPath = path.join(FRONTEND_ABI_PATH, `${contractName}.json`);

        fs.writeFileSync(destinationPath, JSON.stringify(simplifiedAbi, null, 2));
        console.log(`✅ Copied ABI for ${contractName} to ${destinationPath}`);
        
      } catch (error) {
        console.error(`❌ Error copying ABI for ${contractName}: ${error.message}`);
      }
    }
    console.log("--- ABI Copy Script Finished ---");
}

copyAbi();