import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deploySC, WalletClient, ISCData } from '@massalabs/massa-sc-deployer';
import {
  BUILDNET_CHAIN_ID,
  DefaultProviderUrls,
  MAX_GAS_DEPLOYMENT,
  MassaUnits,
} from '@massalabs/massa-web3';

dotenv.config();

const publicApi = DefaultProviderUrls.BUILDNET;

const privKey = process.env.WALLET_PRIVATE_KEY;
if (!privKey) throw new Error('Missing WALLET_PRIVATE_KEY in .env file');

const deployerAccount = await WalletClient.getAccountFromSecretKey(privKey);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));

(async () => {
  const main: ISCData = {
    data: readFileSync(path.join(__dirname, 'build', 'main.wasm')),
    coins: BigInt(1000) * MassaUnits.oneMassa,
    protoPaths: [], // proto files for deployment
  };

  await deploySC(
    publicApi,
    deployerAccount,
    [main],
    BUILDNET_CHAIN_ID,
    0n,
    MAX_GAS_DEPLOYMENT,
    true,
  );
  process.exit(0); // terminate the process after deployment(s)
})();
