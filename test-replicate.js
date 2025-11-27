/* eslint-disable @typescript-eslint/no-require-imports */
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: 'r8_Jcpeq4BpREhPKPCKCaRCTrwon8BeZy92QeZmd',
});

async function test() {
  const output = await replicate.run(
    "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    { input: { prompt: "a cute cat" } }
  );
  console.log(output);
}

test();
