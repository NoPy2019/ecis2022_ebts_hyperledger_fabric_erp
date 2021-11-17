/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Contract } = require('fabric-contract-api');
const ClientIdentity = require('fabric-shim').ClientIdentity;
class UTXO extends Contract {

	// take InitLedger for Init Invoke Call
    async InitLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        //nothing to see here
        console.info('============= END   : Initialize Ledger ===========');
        return "INIT LEDGER IS DONE!";
    }
	
	// use mint() for creating a single asset on blockchain
    async mint(ctx, matNr, batchNr, serialNr, txEvent, timestampErp) {
        // add further checks optional
        let cid = new ClientIdentity(ctx.stub);
        let owner = cid.getMSPID();
        let utxo = {
			// further attributes optional
			txEvent: txEvent,
			timestampErp: timestampErp,
            spent: false
        }

		// check if assets already exists
		const inputUTXObytes = await ctx.stub.getState(ctx.stub.createCompositeKey("utxo", [owner, matNr, batchNr, serialNr]));
		if (!inputUTXObytes || inputUTXObytes.length === 0) {
            await ctx.stub.putState(ctx.stub.createCompositeKey("utxo", [owner, matNr, batchNr, serialNr, ctx.stub.getTxID() + ".0"]), Buffer.from(JSON.stringify(utxo)));
			console.info('============= Token minted successfully ===========');
			console.log(JSON.stringify(utxo));
			console.log(ctx.stub.getTxID());
			return ctx.stub.getTxID();
        } else {
			return `UTXO asset does already exist!`;
			throw new Error(`UTXO asset does already exist!`);
		}
    }
	
	// mintBulk() for creating multiple assets
	async mintBulk(ctx, inputs){
		inputs = JSON.parse(inputs);
		if (inputs.length!=0){
			for(let i=0; i<inputs.length; i++){
				let input = inputs[i];
				if (!input.spent || input.spent <= 0) {
					return "Error in Amount!";
					throw new Error("Amount must be positive, NOT SPENT");
				}
				// TODO add further checks 
				let cid = new ClientIdentity(ctx.stub);
				let owner = cid.getMSPID();
				let utxo = {
					txEvent: input.txEvent,
					timestampErp: input.timestampErp,
					spent: false
				}
				await ctx.stub.putState(ctx.stub.createCompositeKey("utxo", [owner, input.matNr, input.batchNr, input.serialNr, ctx.stub.getTxID() + ".0"]), Buffer.from(JSON.stringify(utxo)));
				return ctx.stub.getTxID();
			}
		}
    }
	
	// transfer inputs and outputs with one transaction
	async bulktransfer(ctx, inputs, outputs) {
		let income = inputs.replace(/\"/g,'"');
		inputs = JSON.parse(income);
		let outcome = outputs.replace(/\"/g,'"');
		outputs = JSON.parse(outcome);

        let cid = new ClientIdentity(ctx.stub); 
        let owner = cid.getMSPID();
        let inputUTXOs = [];
        let inputKeys = [];
		let outIDs = [];

        for(let i=0; i<inputs.length; i++){

            let input = inputs[i];
			
            const inputUTXObytes = await ctx.stub.getState(ctx.stub.createCompositeKey("utxo", [owner, input.matNr, input.batchNr, input.serialNr, input.txID]));
			
            if (!inputUTXObytes || inputUTXObytes.length === 0) {
                throw new Error(`UTXO input does not exist!`);
            }
            const inputUTXOstring = Buffer.from(inputUTXObytes).toString('utf8');
            let inputUTXO;
            try {
                inputUTXO = JSON.parse(inputUTXOstring);
            } catch (err) {
                console.log(err);
                inputUTXO = inputUTXOstring;
            }
            if(inputUTXO.spent)
                throw new Error(`UTXO has already been spend!`)
            inputUTXO.owner = owner;
            inputUTXO.matNr = input.matNr;
            inputUTXO.batchNr = input.batchNr;
			inputUTXO.serialNr = input.serialNr;
            inputUTXO.txID = input.txID;
            inputKeys.push([owner, input.matNr, input.batchNr, input.serialNr, input.txID])
            inputUTXOs.push(inputUTXO)
        }
		
        for(let i=0; i<outputs.length; i++){
			
            let output = outputs[i];
            let utxo = {
                inputs: inputKeys,
				txEvent: output.txEvent,
				timestampErp: output.timestampErp,
                spent: false
            }
           await ctx.stub.putState(ctx.stub.createCompositeKey("utxo", [output.owner, output.matNr, output.batchNr, output.serialNr, ctx.stub.getTxID() + ".0"]), Buffer.from(JSON.stringify(utxo)));
		   outIDs.push(ctx.stub.getTxID() + ".0");
        }
		
        for(let i=0; i<inputs.length; i++){
            let inputUTXO = inputUTXOs[i];
            inputUTXO.spent = true;
            let matNr = inputUTXO.matNr;
            let batchNr = inputUTXO.batchNr;
			let serialNr = inputUTXO.serialNr;
            let txID = inputUTXO.txID;
            delete inputUTXO.owner;
            delete inputUTXO.matNr;
            delete inputUTXO.batchNr;
			delete inputUTXO.serialNr;
            delete inputUTXO.owtxIDner;
            await ctx.stub.putState(ctx.stub.createCompositeKey("utxo", [owner, matNr, batchNr, serialNr, txID]), Buffer.from(JSON.stringify(inputUTXO)));
        }
		return outIDs;
    }
	
	// get all assets for one single client
    async clientUTXOs(ctx){
        let cid = new ClientIdentity(ctx.stub); 
        let owner = cid.getMSPID();
        let allResults = [];
        for await (const {key, value} of ctx.stub.getStateByPartialCompositeKey("utxo", [owner])){
            const strValue = Buffer.from(value).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResults.push({ Key: key, Record: record });
        }
        console.log(allResults);
		return JSON.stringify(allResults);
    }

	// returns txID for matnr & batchnr
    async getTxID(ctx, matNr, batchNr){
        let cid = new ClientIdentity(ctx.stub);
        let owner = cid.getMSPID();
        let allResults = [];
        for await (const {key, value} of ctx.stub.getStateByPartialCompositeKey("utxo", [owner, matNr, batchNr])){
            const strValue = Buffer.from(value).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            if(!record.spent)
                allResults.push({ Key: key, Record: record });
        }
        console.info(allResults);
        return JSON.stringify(allResults);
    }
	
	// DeleteAsset deletes an given asset from the world state.
    async redeemAsset(ctx, matNr, batchNr, serialNr, txID) {
        const exists = await this.AssetExists(ctx, matNr, batchNr, serialNr, txID);
        if (!exists) {
            throw new Error(`The asset ${matNr} & $(batchNr) & $(serialNr) & $(txID) does not exist`);
        }
        return ctx.stub.deleteState(matNr, batchNr, serialNr, txID);
    }

	// returns mspid
    async clientId(ctx){
        let cid = new ClientIdentity(ctx.stub);
        let owner = cid.getMSPID();
        console.info(owner);
        return cid.getMSPID();
    }
    
}

module.exports = UTXO;
