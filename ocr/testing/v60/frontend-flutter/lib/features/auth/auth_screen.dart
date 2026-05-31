// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import 'auth_provider.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  bool _loading    = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _error = null; });
    final ok = await ref.read(authNotifierProvider.notifier)
        .login(_emailCtrl.text.trim(), _passCtrl.text.trim());
    if (!mounted) return;
    if (ok) {
      context.go('/cases');
    } else {
      setState(() { _loading = false; _error = 'Credenciales incorrectas'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Center(
        child: Container(
          width: 380,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: VilarColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: VilarColors.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Logo / título
              Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: VilarColors.accent.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: VilarColors.accent.withOpacity(0.4)),
                  ),
                  child: const Icon(Icons.balance, color: VilarColors.accent, size: 20),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('VILAR Legal OS', style: Theme.of(context).textTheme.titleLarge),
                    Text('v60 · Artifact Factory',
                        style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ]),
              const SizedBox(height: 28),

              // Email
              Text('Email', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 6),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(hintText: 'usuario@firma.mx'),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 16),

              // Password
              Text('Contraseña', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 6),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                decoration: const InputDecoration(hintText: '••••••••'),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 8),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: VilarColors.accentRed, fontSize: 12)),
                ),
              const SizedBox(height: 8),

              // Botón
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: VilarColors.bg))
                      : const Text('Iniciar sesión'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
