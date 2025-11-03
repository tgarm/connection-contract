// scripts/deploy.js (Ethers v5 CJS)

const { ethers } = require("hardhat");
require('dotenv').config(); // 加载环境变量

const fs = require('fs');
const path = require('path');

// 辅助函数：加载 ABI 和 Bytecode
function loadArtifact(contractName) {
    const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', contractName + '.sol', contractName + '.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    return { abi: artifact.abi, bytecode: artifact.bytecode };
}

// 辅助函数：安全更新 .env 文件内容
function updateEnvFile(filePath, key, value) {
    let content = '';
    if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf8');
    }

    // 构建新的行
    const newEntry = `${key}=${value}`;
    
    // 使用正则表达式查找并替换 key=value 模式
    // 匹配 key= 后面直到行尾的内容
    const regex = new RegExp(`^${key}=.*$`, 'm');

    if (content.match(regex)) {
        // 如果 key 已存在，则替换整行
        content = content.replace(regex, newEntry);
    } else {
        // 如果 key 不存在，则追加到文件末尾（确保换行）
        if (content.length > 0 && !content.endsWith('\n')) {
            content += '\n';
        }
        content += newEntry + '\n';
    }

    fs.writeFileSync(filePath, content.trim() + '\n');
}

async function main() {
    // 1. 设置 Signer
    const [deployer] = await ethers.getSigners();
    console.log("部署合约的账户:", deployer.address);
    
    // 🚨 检查私钥是否存在，用于前端充值功能
    const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
    if (DEPLOYER_PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
        console.log("警告: 未在 .env 中设置 PRIVATE_KEY。前端水龙头功能将不起作用，直到手动配置私钥。");
    }

    // --- 2. 部署 ConnectionToken (CT) ---
    const { abi: CT_ABI, bytecode: CT_BYTECODE } = loadArtifact("ConnectionToken");
    const initialSupply = ethers.utils.parseEther("1000000"); 
    const CT = await ethers.getContractFactory("ConnectionToken", deployer);
    const ctToken = await CT.deploy(initialSupply);
    await ctToken.deployed();
    console.log("ConnectionToken (CT) 已部署到:", ctToken.address);

    // --- 3. 部署 ConnectionUserRegistry ---
    const REG_FEE = ethers.utils.parseEther("0.01");
    const MOD_FEE = ethers.utils.parseEther("0.005");
    const AIRDROP_RATIO = 100;

    const Registry = await ethers.getContractFactory("ConnectionUserRegistry", deployer);
    const registry = await Registry.deploy(
        ctToken.address,
        REG_FEE,
        MOD_FEE,
        AIRDROP_RATIO
    );
    await registry.deployed();
    console.log("Registry 合约已部署到:", registry.address);
    
    // --- 4. 初始化空投周期 ---
    const totalAirdropAmount = ethers.utils.parseEther("10000"); 
    await ctToken.transfer(registry.address, totalAirdropAmount);
    console.log(`已将 ${ethers.utils.formatEther(totalAirdropAmount)} CT 转移到 Registry 合约.`); 
    await registry.startNewAirdropCycle(totalAirdropAmount, AIRDROP_RATIO);
    console.log("空投周期已启动。");
    
    // 🚨 5. 写入前端环境变量文件 (.env) - 使用非破坏性更新
    const frontEndEnvPath = path.join(__dirname, '..', 'demo-web', '.env');
    
    updateEnvFile(frontEndEnvPath, 'VUE_APP_REGISTRY_ADDRESS', registry.address);
    updateEnvFile(frontEndEnvPath, 'VUE_APP_CT_TOKEN_ADDRESS', ctToken.address);
    updateEnvFile(frontEndEnvPath, 'VUE_APP_DEPLOYER_PRIVATE_KEY', DEPLOYER_PRIVATE_KEY);

    console.log(`Frontend environment variables updated in ${frontEndEnvPath}`);    
    
    // 🚨 6. 复制 ABI 文件到新目录
    const abiSourcePath = path.join(__dirname, '..', 'artifacts', 'contracts', 'ConnectionUserRegistry.sol', 'ConnectionUserRegistry.json');
    const abiDestDir = path.join(__dirname, '..', 'demo-web', 'src', 'config', 'abi');
    const abiDestPath = path.join(abiDestDir, 'ConnectionUserRegistry.json');

    if (!fs.existsSync(abiDestDir)) {
        fs.mkdirSync(abiDestDir, { recursive: true });
    }
    fs.copyFileSync(abiSourcePath, abiDestPath);
    console.log(`ABI文件已复制到: ${abiDestPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});