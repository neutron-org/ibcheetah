import process from 'process';
import fetch from 'node-fetch';

if (process.argv.length != 4) {
  console.log('Usage: ibcheetah RPC CHAIN_ID');
  console.log('Where RPC is a node address');
  console.log('CHAIN_ID is a counterparty chain you are interested in');
  process.exit(1);
}

const getConnections = async (rest) => {
  let resConnections = {};
  let resClients = {};
  let connections = await rest.getConnections();
  for (let i = 0; i < connections.length; i++) {
    let connection = connections[i];
    resConnections[connection.id] = connection;
  
    if (resClients[connection.clientId] === undefined) {
      // console.log("Connection: client_id: " + connection.clientId);
      let client = await rest.getClient(connection.clientId);
      resClients[connection.clientId] = client;
      // process.stdout.write('+');
    } else {
      // process.stdout.write('.');
    }
  }

  return { connections: resConnections, clients: resClients };
};

const getChannels = async (rest) => {
  return await rest.getChannels();
}

const getClientStatuses = async (rest, clientIds) => {
  let res = {}; // { [key: string]: string }

  clientIds.forEach((clientId) => {
    let clientStatus = clientStatuses[clientId] || await rest.getClientStatus(clientId);
  });

  return res;
}

// supplements channels data with with its respective connections and clients information
const combineData = async (rest, connections, clients, channels, targetChainId, filters = {}) => {
  const res = [];

  let clientStatuses = {}; // { [key: string]: string }
  for (var i = 0; i < channels.length; i++)  {
    let channel = channels[i];

    let connection = connections[channel.connectionHops[0]];
    let client = clients[connection.clientId];
    if (client.chainId == targetChainId) {
      let clientStatus = clientStatuses[connection.clientId];
      if (!clientStatus) {
        clientStatus = await rest.getClientStatus(connection.clientId);
          clientStatuses[connection.clientId] = clientStatus;
      }
  
      if (channel.state == 'STATE_INIT' && channel.counterpartyId == '') {
          channel.counterpartyId = 'does_not_exist';
      }

      // TODO: need counterparty rest to do it?
      // let counterpartyClientStatus = clientStatuses[connection.counterpartyClientId];
      // if (!counterpartyClientStatus) {
      //   counterpartyClientStatus = await rest.getClientStatus(connection.clientId);
      //     clientStatuses[connection.clientId] = counterpartyClientStatus;
      // }
  
      // if (channel.state == 'STATE_INIT' && channel.counterpartyId == '') {
      //     channel.counterpartyId = 'does_not_exist';
      // }

      res.push({
        channel: {
          id:                         channel.id,
          port_id:                    channel.port,
          counterparty_id:            channel.counterpartyId,
          counterparty_port_id:       channel.counterpartyPort,
          ordering:                   channel.ordering,
          state:                      channel.state,
        },
        connection: {
          connection_id:              channel.connectionHops[0],
          client_id:                  connection.clientId,
          client_status:              clientStatus,
          counterparty_connection_id: connection.counterpartyId,
          counterparty_client_id:     connection.counterpartyClientId,
          // counterparty_client_status: counterpartyClientStatus,
          connection_state:           connection.state,
        },
      });
    }
  }

  return res;
}

class Client {
  constructor(id, chainId) {
    this.id = id;
    this.chainId = chainId;
  }
}

class Channel {
  constructor(id, port, connectionHops, counterpartyId, counterpartyPort, ordering, state) {
    this.id = id;
    this.port = port;
    this.connectionHops = connectionHops;
    this.counterpartyId = counterpartyId;
    this.counterpartyPort = counterpartyPort;
    this.ordering = ordering;
    this.state = state;
  }
}

class Connection {
  constructor(id, clientId, state, counterpartyId, counterpartyClientId) {
    this.id = id;
    this.clientId = clientId;
    this.state = state;
    this.counterpartyId = counterpartyId;
    this.counterpartyClientId = counterpartyClientId;
  }
}

class Rest {
  constructor(urlBase) {
    this.urlBase = urlBase;
  }

  async getConnections() {
    let endpoint = `${this.urlBase}/ibc/core/connection/v1/connections`;
    let res = [];

    while (true) {
      let response = await fetch(endpoint);
      let result = await response.json();

      for (let connection of result.connections) {
        let counterparty = connection.counterparty;

        res.push(new Connection(
          connection.id,
          connection.client_id,
          connection.state,
          counterparty.connection_id,
          counterparty.client_id,
        ));
      }

      let nextKey = result.pagination.next_key;
      if (nextKey) {
        let url = new URL(endpoint);
        url.searchParams.set('pagination.key', nextKey);
        endpoint = url.href;
      } else {
        break;
      }
    }

    return res;
  }

  async getChannels() {
    let endpoint = `${this.urlBase}/ibc/core/channel/v1/channels`;
    let res = [];

    while (true) {
      let response = await fetch(endpoint);
      let result = await response.json();

      for (let channel of result.channels) {
        let connectionHops = [];
        for (let hop of channel.connection_hops) {
          connectionHops.push(hop);
        }

        res.push(new Channel(
          channel.channel_id,
          channel.port_id,
          connectionHops,
          channel.counterparty.channel_id,
          channel.counterparty.port_id,
          channel.ordering,
          channel.state,
        ));
      }

      let nextKey = result.pagination.next_key;
      if (nextKey) {
        let url = new URL(endpoint);
        url.searchParams.set('pagination.key', nextKey);
        endpoint = url.href;
      } else {
        break;
      }
    }

    return res;
  }

  async getClient(clientId) {
    let endpoint = `${this.urlBase}/ibc/core/client/v1/client_states/${clientId}`;
    let response = await fetch(endpoint);
    let result = await response.json();

    console.log(result);

    let chainId = result.client_state.chain_id;

    return new Client(clientId, chainId);
  }

  async getClientStatus(clientId) {
    let endpoint = `${this.urlBase}/ibc/core/client/v1/client_status/${clientId}`;
    let response = await fetch(endpoint);
    let result = await response.json();

    return result.status;
  }
}

const main = async (rest, targetChainId) => {
  const {connections, clients} = await getConnections(rest);
  const channels = getChannels(rest);
  const combinedData = combineData(rest, connections, clients, channels, targetChainId);
  // TODO: output channels to stdout
  const output = JSON.stringify(combinedData, null, 2)
  console.log(output);
}

let rest = new Rest(process.argv[2]);
let targetChainId = process.argv[3];

main(rest, targetChainId).then();
