// v60 - nueva funcionalidad
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences.dart' show SharedPreferences;
import '../../core/api_client.dart';

final authStateProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  try {
    return await ApiClient().me();
  } catch (_) {
    return {};
  }
});

final currentUserProvider = StateProvider<Map<String, dynamic>>((ref) => {});

class AuthNotifier extends AsyncNotifier<Map<String, dynamic>> {
  @override
  Future<Map<String, dynamic>> build() async {
    try {
      return await ApiClient().me();
    } catch (_) {
      return {};
    }
  }

  Future<bool> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final result = await ApiClient().login(email, password);
      if (result['ok'] == true || result['user'] != null) {
        final user = await ApiClient().me();
        state = AsyncData(user);
        ref.read(currentUserProvider.notifier).state = user;
        return true;
      }
      state = AsyncData({});
      return false;
    } catch (e, st) {
      state = AsyncError(e, st);
      return false;
    }
  }

  Future<void> logout() async {
    await ApiClient().logout();
    state = const AsyncData({});
    ref.read(currentUserProvider.notifier).state = {};
  }
}

final authNotifierProvider =
    AsyncNotifierProvider<AuthNotifier, Map<String, dynamic>>(AuthNotifier.new);
