/// Drop-in endpoint contract for the existing Noamany employee application.
/// No HTTP package is required; use these values with Dio, http, or the app's
/// current networking layer.
abstract final class NoamanyLegacyApi {
  static const apiRoot = '/Api';

  static String endpoint(String name) => '$apiRoot/$name';

  static const publicEndpoints = <String>{
    'getAppinfo', 'getAppPolicy', 'SplashScreens', 'login_app', 'Check_Option',
  };

  static const profile = <String>{
    'getProfile', 'AppServices', 'AllEmplyees', 'update_pass',
    'update_pass_past', 'update_profile_image', 'Add_signature',
    'show_screen_alert', 'Alert_Screen', 'Add_Screen_action',
  };

  static const messaging = <String>{
    'SendMessage', 'ViewMessage', 'SeenMessage', 'DeleteMessage',
    'InboxMessages', 'SentMessages', 'today_notification',
    'register_device_token', 'insert_update_token',
  };

  static const leaves = <String>{
    'Agazat_types', 'Add_Agaza', 'Add_Agazax', 'Get_agaza_List',
    'Get_Agaza_data', 'Edit_Agaza', 'Delete_agaza', 'Egraa_agaza',
  };

  static const permissions = <String>{
    'Ozonat_types', 'Add_Ezn', 'Get_Ezn_List', 'Get_Wared_Ezn_List',
    'Get_Ezn_data', 'Edit_Ezn', 'Delete_ezn', 'Egraa_ezn',
  };

  static const attendance = <String>{
    'attendance', 'attendance_new', 'add_hdor_ensraf',
    'add_hdor_ensraf_asly', 'get_branches', 'Report_Basma', 'Basma_Today',
    'sheft_types', 'dwam_types', 'add_sheft_edafi', 'add_hours_edafi',
    'Report_hours_edafi', 'report_tabdel_sheft',
  };

  static const hrContent = <String>{
    'Get_ta3mem_list', 'Get_ta3mem_data', 'SeenTa3mem',
    'Get_Enzarat_list', 'Get_enzar_data', 'SeenEnzar',
    'Get_lawa2h_list', 'SeenLayha', 'Months_List',
    'Get_mosalat_list', 'Add_mosala_response',
  };

  static const employeeServices = <String>{
    'Ntaqat_types', 'Get_emp_ntaq', 'Talabat_types', 'Get_emp_ehsaeyat',
    'Get_mangar_ehsaeyat', 'Add_Talab', 'Get_Talabat_List',
    'Get_Talab_data', 'Delete_Talab_order', 'Add_Mobadra',
    'Get_Mobadarat_List', 'Delete_Mobadra', 'add_nashat',
    'Get_Nashat_List', 'Delete_Nashat', 'Add_Task', 'Get_Tasks_List',
    'Delete_task', 'Add_location_basma', 'get_employee_visits',
    'Delete_zeyara', 'All_sliders',
  };

  static const loans = <String>{
    'Solaf_meta', 'Add_Solfa', 'Get_Solaf_List', 'Get_Solfa_data',
    'Egraa_solfa', 'Delete_solfa',
  };

  static Map<String, String> authHeaders(String accessToken) => {
        'Authorization': 'Bearer $accessToken',
        'Accept': 'application/json',
      };
}

final class LegacyApiEnvelope<T> {
  const LegacyApiEnvelope({required this.status, required this.message, this.data});

  final int status;
  final String message;
  final T? data;

  bool get isSuccess => status == 200;

  factory LegacyApiEnvelope.fromJson(
    Map<String, dynamic> json,
    T Function(Object? value) decode,
  ) {
    return LegacyApiEnvelope<T>(
      status: int.tryParse('${json['status']}') ?? 400,
      message: '${json['message'] ?? ''}',
      data: json.containsKey('data') ? decode(json['data']) : null,
    );
  }
}

final class LegacyLoginSession {
  const LegacyLoginSession({required this.accessToken, this.refreshToken});

  final String accessToken;
  final String? refreshToken;

  factory LegacyLoginSession.fromResponse(Map<String, dynamic> response) {
    final data = response['data'] as Map<String, dynamic>? ?? const {};
    final token = '${data['access_token'] ?? ''}';
    if (token.isEmpty) throw const FormatException('Missing access_token');
    return LegacyLoginSession(
      accessToken: token,
      refreshToken: data['refresh_token']?.toString(),
    );
  }
}
