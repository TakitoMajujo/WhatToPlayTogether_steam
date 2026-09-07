package com.whattoplaytogether.mobile;

import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SteamCallback")
public class SteamCallbackPlugin extends Plugin {
    private ServerSocket server;
    private Thread acceptThread;
    private PluginCall pendingWait;

    @PluginMethod
    public void start(PluginCall call) {
        stopServer(false);
        try {
            server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            JSObject result = new JSObject();
            result.put("port", server.getLocalPort());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No se pudo abrir el servidor local", e);
        }
    }

    @PluginMethod
    public void waitForCallback(PluginCall call) {
        if (server == null) {
            call.reject("El servidor local no está activo");
            return;
        }
        pendingWait = call;
        call.setKeepAlive(true);
        acceptThread = new Thread(this::acceptOnce, "steam-callback");
        acceptThread.start();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServer(true);
        call.resolve();
    }

    private void acceptOnce() {
        ServerSocket current = server;
        if (current == null) return;
        try {
            current.setSoTimeout(5 * 60 * 1000);
            while (!current.isClosed()) {
                Socket socket = current.accept();
                String query = readQuery(socket);
                writeOk(socket);
                socket.close();
                if (query != null && !query.isEmpty()) {
                    notifySuccess(query);
                    return;
                }
            }
        } catch (SocketTimeoutException e) {
            notifyError("El inicio de sesión tardó demasiado");
        } catch (Exception e) {
            notifyError("Inicio de sesión cancelado");
        }
    }

    private String readQuery(Socket socket) throws Exception {
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)
        );
        String line = reader.readLine();
        if (line == null) return null;
        String[] parts = line.split(" ");
        if (parts.length < 2) return null;
        String path = parts[1];
        int queryAt = path.indexOf('?');
        if (queryAt < 0) return "";
        return path.substring(queryAt + 1);
    }

    private void writeOk(Socket socket) {
        try {
            String html = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"/>"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
                + "<title>WhatToPlayTogether</title>"
                + "<style>html,body{height:100%;margin:0;background:#07090f;color:#e8eef7;"
                + "font-family:system-ui,sans-serif}body{display:grid;place-items:center}"
                + "p{opacity:.85;padding:24px;text-align:center}</style></head>"
                + "<body><p>Inicio de sesión completado. Puedes volver a la app.</p></body></html>";
            byte[] body = html.getBytes(StandardCharsets.UTF_8);
            String headers = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/html; charset=utf-8\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n";
            OutputStream out = socket.getOutputStream();
            out.write(headers.getBytes(StandardCharsets.US_ASCII));
            out.write(body);
            out.flush();
        } catch (Exception ignored) {
            // Chrome ya recibió el redirect; el HTML es solo confirmación
        }
    }

    private void notifySuccess(String query) {
        new Handler(Looper.getMainLooper()).post(() -> {
            PluginCall call = pendingWait;
            pendingWait = null;
            if (call == null) return;
            JSObject result = new JSObject();
            result.put("search", query);
            call.resolve(result);
        });
    }

    private void notifyError(String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            PluginCall call = pendingWait;
            pendingWait = null;
            if (call != null) call.reject(message);
        });
    }

    private void stopServer(boolean rejectPending) {
        PluginCall call = pendingWait;
        pendingWait = null;
        if (rejectPending && call != null) {
            call.reject("Inicio de sesión cancelado");
        }
        try {
            if (server != null) server.close();
        } catch (Exception ignored) {
            // Ya cerrado
        }
        server = null;
        if (acceptThread != null) {
            acceptThread.interrupt();
            acceptThread = null;
        }
    }

    @Override
    public void handleOnDestroy() {
        stopServer(true);
        super.handleOnDestroy();
    }
}
