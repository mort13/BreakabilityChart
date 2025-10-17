// Load mining data from UEX API
let miningData = {
  laserheads: [],
  modules: [],
  gadgets: []
};

async function loadMiningData() {
  const endpoints = ["laserheads", "modules", "gadgets"];
  for (const ep of endpoints) {
    const res = await fetch('https://uexcorp.space/api/v2/mining/laserheads', {
  headers: { 'Authorization': '96e0d7370dc04112d89722be37babd9f61dd4bfa' }
})
    const json = await res.json();
    miningData[ep] = json;
  }
  console.log("Data loaded:", miningData);
}
