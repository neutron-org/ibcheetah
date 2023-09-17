# ibcheetah

![](https://64.media.tumblr.com/23b88e2462a5e4a1ad6a9c6979dacf08/tumblr_mjzhv2lp3O1rlig6oo1_500.gifv)

## Example

```bash
dart run ibcheetah https://cosmos-rest.staketab.org neutron-1
```

New interface
```bash
node ./bin/ibcheetah.js https://rest-palvus.pion-1.ntrn.tech/ axelar-testnet-lisbon-3

// open conn
cat out.json | fx 'x.filter(y => y.connection.connection_state === "STATE_OPEN" && !y.channel.port_id.startsWith("icacontroller"))'

// channels with expired connections
cat out.json | fx 'x.filter(y => y.connection.connection_state === "STATE_OPEN" && y.connection.client_status === "Expired")' 'x.map(y => [y.channel.id, y.connection.connection_id])'
```