// v60 - nueva funcionalidad
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';

final casesProvider = FutureProvider<List<dynamic>>((ref) =>
    ApiClient().getCases());
