## II js sdk

II 结合 MetaMask

## Get Start

### Install

`npm install js-metamask-ii`

### Usage

```js
(async () => {
  const authClient = await AuthClient.create();
  authClient.login({
    maxTimeToLive: BigInt(7) * BigInt(24) * BigInt(3_600_000_000_000), // 1 week
    onSuccess: () => {
      console.log('Login Successful!');
    },
    onError: (error) => {
      console.error('Login Failed: ', error);
    }
  });
})
```


