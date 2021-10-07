const web3 = new Web3(ethereum)
let tokenSpace = undefined
let timelockAbi = undefined
let selectedContractAbi = undefined
let viewMethodsDataList = {}
const signatures = {}
let params = { types: [], values: [] }

const fetchOptions = {
    method: 'GET',
    mode: 'cors',
    headers: {'Content-Type': 'application/json'}
}

const blockExplorerURL = chainId => {
    switch (chainId) {
        case 1:     return "https://api.etherscan.io/" 
        case 56:    return "https://api.bscscan.com/" 
        case 137:   return "https://api.polygonscan.com/"  
        default:    return undefined;
    }
}


const getTimelockInfo = async() => {
    const timelockAddress = document.getElementById("timelockInput").value
    const timelockABI = await getABI(timelockAddress)
    if (timelockABI) {
        await readTimelockData(timelockABI)
        await readTimelockTransactions(timelockABI)
    }else {
        document.getElementById("timelock-info-container").innerHTML = 'ABI not found.</br> Is that is a verified smart contract?</br>  Is that correct chain'
        return 
    }
}

const readTimelockTransactions = async _abi => {
    const timelockAddress   = document.getElementById("timelockInput").value
    const container         = document.getElementById("transactions-container")
    const events            = await getEvents(timelockAddress)
    const eventsAbi         = _abi.filter(item => item.type === "event")

    events.forEach(event => {
        const abiItem = eventsAbi.filter(item => item.signature === event.topics[0])[0]
        const parameters = web3.eth.abi.decodeLog(abiItem.inputs, event.data, event.topics.slice(1))
        container.innerHTML += `
            <div>${abiItem.name}</div>
            <div>${JSON.stringify(parameters)}</div>
            <div></div>`
    })
}

const readTimelockData = async _abi => {
    const timelockAddress   = document.getElementById("timelockInput").value
    const contractInstance  = new web3.eth.Contract(_abi, timelockAddress)
    let viewMethods         = _abi.filter(abiItem => abiItem.stateMutability === "view" && !abiItem.inputs.length)
    viewMethodsDataList = {}
    if (viewMethods.length <= 0) return

    for (const viewAbiItem of viewMethods){
        if (viewAbiItem.outputs?.length == 1){
            const value = await contractInstance.methods[viewAbiItem.name]().call().catch(console.log)
            console.log(viewAbiItem.name, value)
            viewMethodsDataList[viewAbiItem.name] = value
            await new Promise(r => setTimeout(r, 200))//timeout in ms for maintainig api calls pause
        }
    }

    refreshTimelockInfo()
}

const refreshTimelockInfo = () => {
    const container = document.getElementById("timelock-info-container")

    container.innerHTML =`
        <h2>Timelock info</h2>
        <div></div>
        <div></div>
    `


    Object.keys( viewMethodsDataList).forEach(key => {
        container.innerHTML += `
            <div>${key}</div>
            <div>${viewMethodsDataList[key]}</div>
            <div></div>
        `
    })
}

const queueTransaction = async() => {
    const accounts  = await ethereum.request({ method: 'eth_requestAccounts' })
    const Timelock  = new web3.eth.Contract(timelockAbi, tokenSpace['timelock'])
    const abiItem   = getAbiItem(selectedContractAbi, document.getElementById('signature').value)
    params.values = []

    abiItem.inputs.forEach(input => {
        params.values.push(document.getElementById(`${input.name}@${input.type}`).value)
    })

    const tx = Timelock.methods.queueTransaction(
        document.getElementById("addressTarget").value,
        document.getElementById("value").value || 0,
        web3.eth.abi.encodeFunctionSignature(abiItem),// '' + abiItem.name
        web3.eth.abi.encodeParameters(params.types, params.values),
        +(Date.now() / 1e3 + 86450).toFixed()
    ).send({ from: accounts[0] })

    document.getElementById("submit").innerHTML = "awaiting confirmaton in metamask"
}

const executeTransaction = async() => {
    const accounts  = await ethereum.request({ method: 'eth_requestAccounts' })
    const Timelock  = new web3.eth.Contract(timelockAbi, tokenSpace['timelock'])
    const abiItem   = getAbiItem(selectedContractAbi, document.getElementById('signature').value)
    params.values   = []

    abiItem.inputs.forEach(input => {
        params.values.push(document.getElementById(`${input.name}@${input.type}`).value)
    })

    Timelock.methods.executeTransaction(
        document.getElementById("addressTarget").value,
        document.getElementById("value").value || 0,
        web3.eth.abi.encodeFunctionSignature(abiItem),
        web3.eth.abi.encodeParameters(params.types, params.values),
        +(Date.now() / 1e3 + 86400).toFixed()
    ).send({ from: accounts[0] })

    document.getElementById("submit").innerHTML = "awaiting confirmaton in metamask"
}



const insertOption = (selectName, value) => {
    let opt         = document.createElement('option')
    opt.value       = value;
    opt.innerHTML   = value;
    document.getElementById(selectName).appendChild(opt)
}

const getABI = async _address => {
    await sleep(5000)
    try {
        const response = await fetch(`${blockExplorerURL(+ethereum.chainId)}api?module=contract&action=getsourcecode&address=${_address}`, fetchOptions)
        let data = await response.json()
        return JSON.parse(data.result[0].ABI)
    } catch (error) {
        return undefined
    }
}

const getEvents = async _address => {
    await sleep(5000)
    try {
        // const latest = await web3.eth.getBlock('latest')
        // const watchingTime = +viewMethodsDataList["GRACE_PERIOD"] + +viewMethodsDataList["delay"]
        // const blockRange = watchingTime / blockTime
        // const from = +(latest.number - blockRange).toFixed()    
        const response = await fetch(`${blockExplorerURL(+ethereum.chainId)}api?module=logs&action=getLogs&fromBlock=${0}&toBlock=latest&address=${_address}`, fetchOptions)
        let data = await response.json()
        return data.result
    } catch (error) {
        return console.error(error)
    }
}

const getAbiItem = (abi, itemName) => {
    if (!abi || abi == 'Contract source code not verified') return undefined
    return abi.filter(abiItem => abiItem.name && abiItem.name === itemName)[0]
}

const readSingleFile = async e => {
    const file = e.target.files[0]
    if (!file) return console.error("file not loaded")
    const reader = new FileReader()
    reader.onload = async e => {
        tokenSpace = await JSON.parse(e.target.result)
        document.getElementById("tokenSpace").innerHTML = `received ${Object.keys(tokenSpace).length} addresses`
        clearSelect('contracts')
        Object.keys(tokenSpace).forEach(key => insertOption('contracts', key))
        timelockAbi = await getABI(tokenSpace['timelock'])
        document.getElementById("timelock").value = tokenSpace['timelock']
    }

    await reader.readAsText(file)
}

const changeContract = async () => {
    const address = tokenSpace[document.getElementById("contracts").value]
    document.getElementById("addressTarget").value = address
    selectedContractAbi = await getABI(address)

    clearSelect('signature')
    selectedContractAbi.filter(abiItem =>
        abiItem.type === 'function' &&
        (abiItem.stateMutability === "nonpayable" || abiItem.stateMutability === "payable")
    ).forEach(abiItem => {
        const sig = web3.eth.abi.encodeFunctionSignature(abiItem)
        signatures[abiItem.name] = sig
        insertOption('signature', abiItem.name)
    })
}

const changeSignature = async () => {
    params = { types: [], values: [] }
    document.getElementById('parameterInputs').innerHTML = ''
    const abiItem = getAbiItem(selectedContractAbi, document.getElementById('signature').value)
    abiItem.inputs.forEach(input => {
        let itemInput = document.createElement('input')
        itemInput.id = `${input.name}@${input.type}`
        itemInput.placeholder = `${input.name}:${input.type}`;
        params.types.push(input.type)
        document.getElementById('parameterInputs').appendChild(itemInput)
    })
}

const installAccount = account => {
    const connectButton     = document.getElementById('enableEthereumButton')
    const selectedAddress   = ethereum.selectedAddress
    connectButton.innerHTML = selectedAddress ? `${selectedAddress.slice(0,6)}...${selectedAddress.slice(38,44)}` : 'Connect metamask',
    connectButton.className = selectedAddress ? 'active' : 'notActive'
}

const installChainId = async chainId => {
    const earliest  = await web3.eth.getBlock('earliest')
    const latest    = await web3.eth.getBlock('latest')
    const blockTime = (latest.timestamp - earliest.timestamp) / latest.number
    document.getElementById('blockTime').innerHTML      = `blockTime: ${+blockTime.toFixed(2)} sec`
    document.getElementById('chainIdSpan').innerHTML    = `chainId: ${chainId}`
}

const clearSelect           = selectName => document.getElementById(selectName).innerHTML = ''
const checkTimelockInput    = e => console.log(e.target.value)
const sleep                 = ms => new Promise(resolve => setTimeout(resolve, ms))

const initiateMetamask = () => {
    installAccount(ethereum.selectedAddress)
    installChainId(+ethereum.chainId)
}

const enableEthereumButtonClickHandler = async () => {
    const isAccountPresent = !!(await ethereum.request({ method: 'eth_requestAccounts' }))
    const isMetamaskConnacted = await ethereum._metamask.isUnlocked()
    const isEthereumConnected = ethereum.isConnected()
    if (isAccountPresent && isMetamaskConnacted && isEthereumConnected) initiateMetamask()
}
  
ethereum.on('connect',          initiateMetamask)
ethereum.on('disconnect',       initiateMetamask)
ethereum.on('accountsChanged',  initiateMetamask)
ethereum.on('chainChanged',     initiateMetamask)

document.getElementById('file-input').addEventListener('change', readSingleFile, false)
document.getElementById("submit").addEventListener("click", queueTransaction)
document.getElementById("execute").addEventListener("click", executeTransaction)
document.getElementById("timelockInput").addEventListener("change", checkTimelockInput)
document.getElementById("readTimelockButton").addEventListener("click", getTimelockInfo)
document.getElementById('enableEthereumButton').addEventListener('click', enableEthereumButtonClickHandler)

