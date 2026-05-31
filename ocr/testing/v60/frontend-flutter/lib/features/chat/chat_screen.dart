// v60 - nueva funcionalidad
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'slash_commands.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String caseId;
  const ChatScreen({super.key, required this.caseId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _inputCtrl    = TextEditingController();
  final _scrollCtrl   = ScrollController();
  final List<_Msg>    _messages = [];
  String              _artifactType = 'analysis';
  bool                _streaming  = false;
  StreamSubscription? _sub;
  StringBuffer        _buffer = StringBuffer();

  // Op log panel
  final List<_OpEntry> _ops = [];
  bool _showOps = false;

  @override
  void dispose() {
    _sub?.cancel();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty || _streaming) return;
    _inputCtrl.clear();

    setState(() {
      _messages.add(_Msg(role: 'user', text: text));
      _streaming = true;
      _buffer    = StringBuffer();
      _ops.clear();
      _messages.add(_Msg(role: 'assistant', text: ''));
    });
    _scrollDown();

    final history = _messages
        .where((m) => m.text.isNotEmpty)
        .take(_messages.length - 1)
        .map((m) => {'role': m.role, 'content': m.text})
        .toList();

    _sub = ApiClient().streamChat(
      message: text,
      caseId: widget.caseId,
      artifactType: _artifactType,
      history: history.length > 20 ? history.sublist(history.length - 20) : history,
    ).listen(
      (event) {
        setState(() {
          switch (event.type) {
            case 'text':
              _buffer.write(event.text ?? '');
              _messages.last = _Msg(role: 'assistant', text: _buffer.toString());
              break;
            case 'op_log':
              _ops.add(_OpEntry(icon: '•', msg: event.text ?? ''));
              break;
            case 'tool_start':
              _ops.add(_OpEntry(icon: '⚙', msg: 'Tool: ${event.tool}'));
              break;
            case 'artifact_saved':
              _ops.add(_OpEntry(icon: '💾', msg: 'Artefacto guardado'));
              break;
            case 'cytoscape':
              _messages.last = _Msg(
                  role: 'assistant',
                  text: _buffer.toString(),
                  cytoscape: event.cytoscape);
              break;
            case 'bulk_task':
              _ops.add(_OpEntry(icon: '⚙', msg: 'Tarea bulk: ${event.taskId}'));
              break;
            case 'done':
              _streaming = false;
              break;
            default:
              break;
          }
        });
        _scrollDown();
      },
      onError: (e) {
        setState(() {
          _streaming = false;
          _messages.last = _Msg(role: 'assistant', text: 'Error: $e', isError: true);
        });
      },
      onDone: () => setState(() => _streaming = false),
    );
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Column(children: [
        // Header
        _ChatHeader(
          caseId: widget.caseId,
          artifactType: _artifactType,
          onTypeChanged: (t) => setState(() => _artifactType = t),
          showOps: _showOps,
          onToggleOps: () => setState(() => _showOps = !_showOps),
          opsCount: _ops.length,
        ),

        // Messages + Op log
        Expanded(
          child: Row(children: [
            // Messages
            Expanded(
              child: ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                itemCount: _messages.length,
                itemBuilder: (_, i) => _BubbleWidget(msg: _messages[i]),
              ),
            ),

            // Op log panel (collapsible)
            if (_showOps)
              _OpLogPanel(ops: _ops),
          ]),
        ),

        // Slash hint if typing /
        if (_inputCtrl.text.startsWith('/'))
          SlashHintBar(query: _inputCtrl.text),

        // Input
        _ChatInput(
          ctrl: _inputCtrl,
          streaming: _streaming,
          onSend: _send,
          onChanged: (_) => setState(() {}),
        ),
      ]),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _ChatHeader extends StatelessWidget {
  final String caseId, artifactType;
  final ValueChanged<String> onTypeChanged;
  final bool showOps;
  final VoidCallback onToggleOps;
  final int opsCount;
  const _ChatHeader({
    required this.caseId, required this.artifactType,
    required this.onTypeChanged, required this.showOps,
    required this.onToggleOps, required this.opsCount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: VilarColors.surface,
        border: Border(bottom: BorderSide(color: VilarColors.border)),
      ),
      child: Row(children: [
        const Icon(Icons.chat_bubble_outline, size: 16, color: VilarColors.accent),
        const SizedBox(width: 8),
        Text('Chat', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(width: 16),
        // Artifact type selector
        _TypeChip(label: 'análisis', value: 'analysis', current: artifactType, onTap: onTypeChanged),
        _TypeChip(label: 'contrato', value: 'contract', current: artifactType, onTap: onTypeChanged),
        _TypeChip(label: 'brief',    value: 'brief',    current: artifactType, onTap: onTypeChanged),
        _TypeChip(label: 'HTML',     value: 'html',     current: artifactType, onTap: onTypeChanged),
        const Spacer(),
        // Op log toggle
        InkWell(
          onTap: onToggleOps,
          borderRadius: BorderRadius.circular(4),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: showOps ? VilarColors.accent.withOpacity(0.15) : Colors.transparent,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: VilarColors.border),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.terminal, size: 13, color: VilarColors.textMuted),
              const SizedBox(width: 4),
              Text('Ops${opsCount > 0 ? " ($opsCount)" : ""}',
                  style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String label, value, current;
  final ValueChanged<String> onTap;
  const _TypeChip({required this.label, required this.value, required this.current, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final active = value == current;
    return GestureDetector(
      onTap: () => onTap(value),
      child: Container(
        margin: const EdgeInsets.only(right: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: active ? VilarColors.accent.withOpacity(0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: active ? VilarColors.accent : VilarColors.border),
        ),
        child: Text(label, style: TextStyle(
          fontSize: 11, color: active ? VilarColors.accent : VilarColors.textMuted,
        )),
      ),
    );
  }
}

// ── Bubble ────────────────────────────────────────────────────────────────────

class _Msg {
  final String role, text;
  final bool isError;
  final Map<String, dynamic>? cytoscape;
  const _Msg({required this.role, required this.text,
               this.isError = false, this.cytoscape});
}

class _BubbleWidget extends StatelessWidget {
  final _Msg msg;
  const _BubbleWidget({required this.msg});

  @override
  Widget build(BuildContext context) {
    final isUser = msg.role == 'user';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            CircleAvatar(
              radius: 14,
              backgroundColor: VilarColors.accent.withOpacity(0.15),
              child: const Icon(Icons.balance, size: 14, color: VilarColors.accent),
            ),
            const SizedBox(width: 10),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isUser ? VilarColors.accent.withOpacity(0.15) : VilarColors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isUser ? VilarColors.accent.withOpacity(0.3) : VilarColors.border,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (msg.text.isEmpty && !isUser)
                    const _TypingIndicator()
                  else
                    MarkdownBody(
                      data: msg.text,
                      styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                        p: Theme.of(context).textTheme.bodyLarge,
                        code: const TextStyle(
                          fontFamily: 'monospace', fontSize: 12,
                          backgroundColor: Color(0xFF1C2128),
                          color: VilarColors.accentGreen,
                        ),
                        codeblockDecoration: BoxDecoration(
                          color: const Color(0xFF161B22),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: VilarColors.border),
                        ),
                      ),
                    ),
                  if (msg.cytoscape != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: VilarColors.accentPurple.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: VilarColors.accentPurple.withOpacity(0.3)),
                        ),
                        child: Row(children: [
                          const Icon(Icons.account_tree, size: 14, color: VilarColors.accentPurple),
                          const SizedBox(width: 6),
                          Text(
                            '${(msg.cytoscape!['elements'] as List? ?? []).length} nodos en el grafo',
                            style: const TextStyle(fontSize: 12, color: VilarColors.accentPurple),
                          ),
                        ]),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (isUser) const SizedBox(width: 10),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: List.generate(3, (i) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Container(
        width: 6, height: 6,
        decoration: BoxDecoration(
          color: VilarColors.textFaint,
          borderRadius: BorderRadius.circular(3),
        ),
      ),
    )),
  );
}

// ── Op log panel ──────────────────────────────────────────────────────────────

class _OpEntry {
  final String icon, msg;
  const _OpEntry({required this.icon, required this.msg});
}

class _OpLogPanel extends StatelessWidget {
  final List<_OpEntry> ops;
  const _OpLogPanel({required this.ops});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 240,
      decoration: const BoxDecoration(
        color: VilarColors.surface,
        border: Border(left: BorderSide(color: VilarColors.border)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.all(10),
          child: Text('Operaciones', style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w600,
            color: VilarColors.textMuted, letterSpacing: 0.6,
          )),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: ops.length,
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${ops[i].icon} ', style: const TextStyle(fontSize: 11, color: VilarColors.accent)),
                  Expanded(child: Text(ops[i].msg,
                      style: const TextStyle(fontSize: 11, color: VilarColors.textMuted),
                      maxLines: 3)),
                ],
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Input ────────────────────────────────────────────────────────────────────

class _ChatInput extends StatelessWidget {
  final TextEditingController ctrl;
  final bool streaming;
  final VoidCallback onSend;
  final ValueChanged<String> onChanged;
  const _ChatInput({required this.ctrl, required this.streaming,
                   required this.onSend, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: const BoxDecoration(
        color: VilarColors.surface,
        border: Border(top: BorderSide(color: VilarColors.border)),
      ),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: ctrl,
            onChanged: onChanged,
            maxLines: null,
            decoration: InputDecoration(
              hintText: 'Escribe un mensaje o /comando…',
              suffixText: streaming ? '⏳' : null,
            ),
            onSubmitted: (_) => onSend(),
          ),
        ),
        const SizedBox(width: 10),
        IconButton(
          onPressed: streaming ? null : onSend,
          icon: streaming
              ? const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: VilarColors.accent))
              : const Icon(Icons.send, color: VilarColors.accent),
        ),
      ]),
    );
  }
}
