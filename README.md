# Dusa: Liquidity Book

This repository contains the Liquidity Book contracts, as well as tests and deploy scripts.

- The [Pair](./assembly/contracts/Pair.ts) is the contract that contains all the logic of the actual pair for swaps, adds, removals of liquidity and fee claiming. This contract should never be deployed directly, and the factory should always be used for that matter. It features a new token standard that is similar to ERC-1155, but without any callbacks (for safety reasons) and any functions or variables relating to ERC-721.

- The [Factory](./assembly/contracts/Factory.ts) is the contract used to deploy the different pairs and acts as a registry for all the pairs already created. There are also privileged functions such as setting the parameters of the fees, the flashloan fee, setting the pair implementation, set if a pair should be ignored by the quoter and add new presets. Unless the `creationUnlocked` is `true`, only the owner of the factory can create pairs.

- The [Router](./assembly/contracts/Router.ts) is the main contract that user will interact with as it adds security checks. Most users shouldn't interact directly with the pair.

- The [Quoter](./assembly/contracts/Quoter.ts) is a contract that is used to return the best route of all those given. This should be used before a swap to get the best return on a swap.

For more information, go to the [documentation](https://docs.dusa.io/) and the [whitepaper](https://dusa.io/whitepaper.pdf).

## Build

By default this will build all files in `assembly/contracts` directory.

```shell
npm run build
```

## Deploy a smart contract

Prerequisites :

-   You must add a .env file at the root of the repository with the following keys set to valid values :
    -   WALLET_PRIVATE_KEY="wallet_private_key"

These keys will be the ones used by the deployer script to interact with the blockchain.

The following command will build your contract and create the deployer associated. Then it will be deployed.
It assumes your contract entrypoint is `assembly/contracts/main.ts`

```shell
npm run deploy
```

This command will deploy your smart contract on Massa's network corresponding to the given node.

When the deployment operation is executed on-chain, the `constructor` function of your smart contract `assembly/contracts/main.ts` will be called.
The `constructor` function can be modified for specific needs, and its call arguments edited in the deployment script `src/deploy.ts`.

## Unit tests

The test framework documentation is available here: [as-pect docs](https://as-pect.gitbook.io/as-pect)

```shell
npm run test
```

## Format code

```shell
npm run fmt
```
