// v60 - nueva funcionalidad
// Cliente HTTP + SSE para la API del backend Flask
import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

// Base URL — en web apunta al mismo origen, en móvil apunta al servidor
const String kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://ocr.ruby.lease/testing/v60',
);

class ApiClient {
  static final ApiClient _i = ApiClient._();
  factory ApiClient() => _i;
  ApiClient._();

  late final Dio _dio = Dio(BaseOptions(
    baseUrl: kBaseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(minutes: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  // ── Auth ───────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await _dio.post('/api/auth/login',
        data: {'email': email, 'password': password});
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> me() async {
    final r = await _dio.get('/api/auth/me');
    return r.data as Map<String, dynamic>;
  }

  Future<void> logout() => _dio.post('/api/auth/logout');

  // ── Cases ──────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getCases() async {
    final r = await _dio.get('/api/cases');
    return (r.data['cases'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createCase(Map<String, dynamic> body) async {
    final r = await _dio.post('/api/cases', data: body);
    return r.data as Map<String, dynamic>;
  }

  // ── Artifacts ──────────────────────────────────────────────────────────────

  Future<List<dynamic>> getArtifacts(String caseId) async {
    final r = await _dio.get('/api/artifacts/$caseId');
    return (r.data['artifacts'] as List?) ?? [];
  }

  Future<void> deleteArtifact(String artifactId) =>
      _dio.delete('/api/artifacts/$artifactId');

  // ── Dashboard ──────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getDashboard() async {
    final r = await _dio.get('/api/dashboard');
    return r.data as Map<String, dynamic>;
  }

  // ── Chat SSE stream ────────────────────────────────────────────────────────

  Stream<ChatEvent> streamChat({
    required String message,
    required String caseId,
    String artifactType = 'analysis',
    List<Map<String, dynamic>> history = const [],
    List<String> selectedArtifacts = const [],
  }) {
    final controller = StreamController<ChatEvent>();
    _streamChatAsync(
      controller: controller,
      message: message,
      caseId: caseId,
      artifactType: artifactType,
      history: history,
      selectedArtifacts: selectedArtifacts,
    );
    return controller.stream;
  }

  Future<void> _streamChatAsync({
    required StreamController<ChatEvent> controller,
    required String message,
    required String caseId,
    required String artifactType,
    required List<Map<String, dynamic>> history,
    required List<String> selectedArtifacts,
  }) async {
    try {
      final resp = await _dio.post<ResponseBody>(
        '/api/v1/chat/stream',
        data: {
          'message': message,
          'case_id': caseId,
          'artifact_type': artifactType,
          'history': history,
          'selected_artifacts': selectedArtifacts,
        },
        options: Options(responseType: ResponseType.stream),
      );

      String buffer = '';
      await for (final chunk in resp.data!.stream) {
        buffer += utf8.decode(chunk);
        final lines = buffer.split('\n');
        buffer = lines.last;
        for (final line in lines.sublist(0, lines.length - 1)) {
          if (line.startsWith('data: ')) {
            final raw = line.substring(6).trim();
            if (raw == '[DONE]') {
              controller.add(const ChatEvent.done());
            } else {
              try {
                final json = jsonDecode(raw) as Map<String, dynamic>;
                controller.add(ChatEvent.fromJson(json));
              } catch (_) {}
            }
          }
        }
      }
      controller.add(const ChatEvent.done());
    } catch (e) {
      controller.addError(e);
    } finally {
      await controller.close();
    }
  }

  // ── Bulk status ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> bulkStatus(String taskId) async {
    final r = await _dio.get('/api/v1/bulk/status/$taskId');
    return r.data as Map<String, dynamic>;
  }
}

// ── Chat event model ──────────────────────────────────────────────────────────

@immutable
class ChatEvent {
  final String type;
  final String? text;
  final String? tool;
  final Map<String, dynamic>? result;
  final Map<String, dynamic>? cytoscape;
  final String? taskId;

  const ChatEvent({
    required this.type,
    this.text,
    this.tool,
    this.result,
    this.cytoscape,
    this.taskId,
  });

  const ChatEvent.done() : this(type: 'done');

  factory ChatEvent.fromJson(Map<String, dynamic> j) => ChatEvent(
        type:      j['type'] as String? ?? 'unknown',
        text:      j['text'] as String?,
        tool:      j['tool'] as String?,
        result:    j['result'] as Map<String, dynamic>?,
        cytoscape: j['data'] as Map<String, dynamic>?,
        taskId:    j['task_id'] as String?,
      );
}
