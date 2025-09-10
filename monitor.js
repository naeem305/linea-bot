const { Web3 } = require('web3');
const axios = require('axios');

// Configuration
const CONFIG = {
    // Contract addresses
    AIRDROP_CONTRACT: '0x87bAa1694381aE3eCaE2660d97fe60404080Eb64',
    LINEA_TOKEN: '0x5FBDF89403270a1846F5ae7D113A989F850d1566',
    
    // Network
    RPC_WSS: 'wss://linea-mainnet.g.alchemy.com/v2/wd-9XAJoEnMc8NWQXwT3Z',
    
    // Telegram
    BOT_TOKEN: '8057483065:AAFd-8FsURLqpXeLCsvdmXchPp8PfHVW9Bg',
    CHAT_ID: '5510795933',
    
    // Monitoring settings
    CHECK_INTERVAL: 60 * 1000, // 1 minute in milliseconds
    MIN_THRESHOLD: '1000000000000000000', // 1 LINEA token (18 decimals)
};

// ERC20 ABI for balance checking
const ERC20_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
];

class LineaAirdropMonitor {
    constructor() {
        this.web3 = new Web3(CONFIG.RPC_WSS);
        this.tokenContract = new this.web3.eth.Contract(ERC20_ABI, CONFIG.LINEA_TOKEN);
        this.lastBalance = '0';
        this.isMonitoring = false;
        this.startTime = Date.now();
    }

    async init() {
        try {
            console.log('🚀 Initializing Linea Airdrop Monitor...');
            
            // Test connection
            const latestBlock = await this.web3.eth.getBlockNumber();
            console.log(`✅ Connected to Linea Mainnet. Latest block: ${latestBlock}`);
            
            // Test Telegram
            await this.sendTelegramMessage('🤖 Linea Airdrop Monitor Started!\n\n📊 Monitoring contract: ' + CONFIG.AIRDROP_CONTRACT + '\n⏰ Check interval: 1 minute');
            
            // Get initial balance
            this.lastBalance = await this.getTokenBalance();
            console.log(`💰 Initial balance: ${this.formatBalance(this.lastBalance)} LINEA`);
            
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }

    async getTokenBalance() {
        try {
            const balance = await this.tokenContract.methods.balanceOf(CONFIG.AIRDROP_CONTRACT).call();
            return balance.toString();
        } catch (error) {
            console.error('Error getting token balance:', error.message);
            return '0';
        }
    }

    formatBalance(balance) {
        const balanceInEther = this.web3.utils.fromWei(balance, 'ether');
        return parseFloat(balanceInEther).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        });
    }

    async sendTelegramMessage(message) {
        try {
            const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: CONFIG.CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            });
            
            if (response.data.ok) {
                console.log('✅ Telegram message sent successfully');
                return true;
            } else {
                console.error('❌ Telegram API error:', response.data);
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to send Telegram message:', error.message);
            return false;
        }
    }

    async checkBalance() {
        try {
            const currentBalance = await this.getTokenBalance();
            const currentBalanceNum = BigInt(currentBalance);
            const lastBalanceNum = BigInt(this.lastBalance);
            
            console.log(`🔍 Current balance: ${this.formatBalance(currentBalance)} LINEA`);
            
            // Check if balance increased
            if (currentBalanceNum > lastBalanceNum) {
                const difference = currentBalanceNum - lastBalanceNum;
                const differenceFormatted = this.formatBalance(difference.toString());
                
                const alertMessage = `🚨 <b>LINEA AIRDROP CONTRACT FUNDED!</b> 🚨\n\n` +
                    `💰 <b>New Balance:</b> ${this.formatBalance(currentBalance)} LINEA\n` +
                    `📈 <b>Increase:</b> +${differenceFormatted} LINEA\n` +
                    `📊 <b>Contract:</b> <code>${CONFIG.AIRDROP_CONTRACT}</code>\n` +
                    `🔗 <b>Explorer:</b> https://lineascan.build/address/${CONFIG.AIRDROP_CONTRACT}\n\n` +
                    `⏰ <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
                    `🎯 <b>ACTION REQUIRED:</b> Contract is now funded! You can proceed with claiming.`;
                
                console.log('🚨 BALANCE INCREASE DETECTED!');
                await this.sendTelegramMessage(alertMessage);
                
                this.lastBalance = currentBalance;
            }
            // Check if balance meets threshold for first time
            else if (currentBalanceNum >= BigInt(CONFIG.MIN_THRESHOLD) && lastBalanceNum < BigInt(CONFIG.MIN_THRESHOLD)) {
                const alertMessage = `✅ <b>Linea Airdrop Contract Funded!</b>\n\n` +
                    `💰 <b>Balance:</b> ${this.formatBalance(currentBalance)} LINEA\n` +
                    `📊 <b>Contract:</b> <code>${CONFIG.AIRDROP_CONTRACT}</code>\n` +
                    `⏰ <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
                    `🎯 Ready for claiming!`;
                
                console.log('✅ FUNDING THRESHOLD REACHED!');
                await this.sendTelegramMessage(alertMessage);
                
                this.lastBalance = currentBalance;
            }
            // Update last balance if there's any change
            else if (currentBalance !== this.lastBalance) {
                this.lastBalance = currentBalance;
            }
            
        } catch (error) {
            console.error('❌ Error checking balance:', error.message);
        }
    }

    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitoring already running');
            return;
        }

        console.log('🔄 Starting monitoring loop...');
        this.isMonitoring = true;

        // Initial check
        await this.checkBalance();

        // Set up interval
        this.monitorInterval = setInterval(async () => {
            if (!this.isMonitoring) return;
            
            const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60); // minutes
            console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Checking... (Uptime: ${uptime}m)`);
            
            await this.checkBalance();
        }, CONFIG.CHECK_INTERVAL);

        console.log(`✅ Monitor started! Checking every ${CONFIG.CHECK_INTERVAL / 1000} seconds`);
        
        // Send status updates every hour
        this.statusInterval = setInterval(async () => {
            const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
            const statusMessage = `🤖 <b>Bot Status Update</b>\n\n` +
                `✅ <b>Status:</b> Running\n` +
                `⏰ <b>Uptime:</b> ${uptime} minutes\n` +
                `💰 <b>Current Balance:</b> ${this.formatBalance(this.lastBalance)} ${this.tokenSymbol}\n` +
                `🔍 <b>Last Check:</b> ${new Date().toLocaleString()}`;
            
            await this.sendTelegramMessage(statusMessage);
        }, 60 * 60 * 1000); // Every hour
    }

    stopMonitoring() {
        console.log('🛑 Stopping monitor...');
        this.isMonitoring = false;
        
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        console.log('✅ Monitor stopped');
    }

    // Graceful shutdown
    async shutdown() {
        console.log('\n🔄 Shutting down gracefully...');
        this.stopMonitoring();
        
        await this.sendTelegramMessage('🛑 Linea Airdrop Monitor Stopped\n\nBot has been shut down.');
        
        // Close web3 connection
        if (this.web3.currentProvider && this.web3.currentProvider.disconnect) {
            this.web3.currentProvider.disconnect();
        }
        
        console.log('✅ Shutdown complete');
        process.exit(0);
    }
}

// Main execution
async function main() {
    const monitor = new LineaAirdropMonitor();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => monitor.shutdown());
    process.on('SIGTERM', () => monitor.shutdown());
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        monitor.shutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Initialize and start monitoring
    const initialized = await monitor.init();
    
    if (initialized) {
        await monitor.startMonitoring();
        console.log('\n🎯 Bot is now monitoring the Linea airdrop contract!');
        console.log('📱 You will receive Telegram notifications when funding is detected.');
        console.log('🔄 Press Ctrl+C to stop the bot gracefully.\n');
    } else {
        console.error('❌ Failed to initialize. Exiting...');
        process.exit(1);
    }
}

// Start the bot
main().catch(console.error);
