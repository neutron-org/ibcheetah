import 'dart:io' show exit, stdout;
import 'dart:convert';
import 'package:http/http.dart' as http;

void main(List<String> arguments) async {
  if (arguments.length != 2) {
    print("Usage: ibcheetah RPC CHAIN_ID");
    print("Where RPC is a node address");
    print("      CHAIN_ID is a counterparty chain you are interested in");
    exit(1);
  }

  final rest = Rest(arguments[0]);
  final Map<String, Client> clients = {};
  final targetChainId = arguments[1];
  final Map<String, Connection> connections = {};
  final Map<String, String> clientStatuses = {};

  stdout.write("Fetching clients");
  await for (final connection in rest.getConnections()) {
    connections[connection.id] = connection;

    if (clients[connection.clientId] == null) {
      final client = await rest.getClient(connection.clientId);
      clients[connection.clientId] = client;
      stdout.write("+");
    } else {
      stdout.write(".");
    }
  }

  print("");
  await for (final channel in rest.getChannels()) {
    final connection = connections[channel.connectionHops[0]]!;
    final client = clients[connection.clientId]!;
    if (client.chainId == targetChainId) {
      var status = clientStatuses[connection.clientId];
      if (status == null) {
        status = await rest.getClientStatus(connection.clientId);
        clientStatuses[connection.clientId] = status;
      }

      if (channel.state == "STATE_INIT" && channel.counterpartyId == "") {
        channel.counterpartyId = "unknown";
      }

      /*print("[${channel.id}(${channel.port})"
          " → "
          "${channel.counterpartyId}(${channel.counterpartyPort})]"
          " over [${connection.state} ${channel.connectionHops[0]}($status ${connection.clientId})"
          " → "
          "${connection.counterpartyId}(${connection.counterpartyClientId})]"
          ", ${channel.ordering} ${channel.state}");*/
      print("Pair:\n"
          "  channel_id:                 ${channel.id}\n"
          "  port_id:                    ${channel.port}\n"
          "  counterparty_channel_id:    ${channel.counterpartyId}\n"
          "  counterparty_port_id:       ${channel.counterpartyPort}\n"
          "  ordering:                   ${channel.ordering}\n"
          "  state:                      ${channel.state}\n"
          "Over connection:\n"
          "  connection_id:              ${channel.connectionHops[0]}\n"
          "  client_id:                  ${connection.clientId}\n"
          "  client_status:              $status\n"
          "  counterparty_connection_id: ${connection.counterpartyId}\n"
          "  counterparty_client_id:     ${connection.counterpartyClientId}\n"
          "  state:                      ${connection.state}\n");
    }
  }
}

class Connection {
  String id;
  String clientId;
  String state;
  String counterpartyId;
  String counterpartyClientId;

  Connection(this.id, this.clientId, this.state, this.counterpartyId,
      this.counterpartyClientId);
}

class Channel {
  String id;
  String port;
  List<String> connectionHops;
  String counterpartyId;
  String counterpartyPort;
  String ordering;
  String state;

  Channel(this.id, this.port, this.connectionHops, this.counterpartyId,
      this.counterpartyPort, this.ordering, this.state);
}

class Client {
  String id;
  String chainId;

  Client(this.id, this.chainId);
}

class Rest {
  String urlBase;
  Rest(this.urlBase);

  Stream<Connection> getConnections() async* {
    var endpoint = Uri.parse("$urlBase/ibc/core/connection/v1/connections");

    for (;;) {
      final result =
          json.decode(await http.read(endpoint)) as Map<String, dynamic>;

      for (final connection in result["connections"] as List<dynamic>) {
        final counterparty = connection["counterparty"] as dynamic;

        yield Connection(
            connection["id"],
            connection["client_id"],
            connection["state"],
            counterparty["connection_id"],
            counterparty["client_id"]);
      }

      final nextKey = result["pagination"]["next_key"] as String?;
      if (nextKey != null) {
        endpoint =
            endpoint.replace(queryParameters: {"pagination.key": nextKey});
      } else {
        break;
      }
    }
  }

  Stream<Channel> getChannels() async* {
    var endpoint = Uri.parse("$urlBase/ibc/core/channel/v1/channels");

    for (;;) {
      final result =
          json.decode(await http.read(endpoint)) as Map<String, dynamic>;

      for (final channel in result["channels"] as List<dynamic>) {
        final counterparty = channel["counterparty"] as dynamic;
        final List<String> connectionHops = [];
        for (final hop in channel["connection_hops"] as List<dynamic>) {
          connectionHops.add(hop as String);
        }

        yield Channel(
            channel["channel_id"],
            channel["port_id"],
            connectionHops,
            counterparty["channel_id"],
            counterparty["port_id"],
            channel["ordering"],
            channel["state"]);
      }

      final nextKey = result["pagination"]["next_key"] as String?;
      if (nextKey != null) {
        endpoint =
            endpoint.replace(queryParameters: {"pagination.key": nextKey});
      } else {
        break;
      }
    }
  }

  Future<Client> getClient(String clientId) async {
    var endpoint =
        Uri.parse("$urlBase/ibc/core/client/v1/client_states/$clientId");
    final result =
        json.decode(await http.read(endpoint)) as Map<String, dynamic>;

    final chainId = (result["client_state"]["chain_id"] as String?) ?? "<N/A>";

    return Client(clientId, chainId);
  }

  Future<String> getClientStatus(String clientId) async {
    var endpoint =
        Uri.parse("$urlBase/ibc/core/client/v1/client_status/$clientId");
    final result =
        json.decode(await http.read(endpoint)) as Map<String, dynamic>;

    return result["status"];
  }
}
