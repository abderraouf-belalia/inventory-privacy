// Convert hex VKs to PTB vector format
const fs = require('fs');
const path = require('path');

const vks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'keys', 'verifying_keys.json'), 'utf-8'));

function hexToVector(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16) + 'u8');
  }
  return `vector[${bytes.join(',')}]`;
}

console.log('// Item Exists VK:');
console.log(hexToVector(vks.item_exists_vk));
console.log('\n// Withdraw VK:');
console.log(hexToVector(vks.withdraw_vk));
console.log('\n// Deposit VK:');
console.log(hexToVector(vks.deposit_vk));
console.log('\n// Transfer VK:');
console.log(hexToVector(vks.transfer_vk));
console.log('\n// Capacity VK:');
console.log(hexToVector(vks.capacity_vk));
console.log('\n// Deposit Capacity VK:');
console.log(hexToVector(vks.deposit_capacity_vk));
console.log('\n// Transfer Capacity VK:');
console.log(hexToVector(vks.transfer_capacity_vk));
