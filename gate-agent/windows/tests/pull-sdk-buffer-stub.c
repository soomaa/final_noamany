/* Test-only native SDK substitute. No network or controller commands. */
#include <string.h>
#ifdef _WIN32
#define EXPORT __declspec(dllexport)
#else
#define EXPORT __attribute__((visibility("default")))
#endif

static int write_buffer(unsigned char *buffer, int size, const char *text) {
    if (!buffer || size < (int)strlen(text) + 1) return -1;
    memset(buffer, 0, (size_t)size);
    memcpy(buffer, text, strlen(text));
    return 0;
}

EXPORT int GetDeviceParam(void *handle, unsigned char *buffer, int size, const char *names) {
    return write_buffer(buffer, size, "~SerialNumber=BUFFER-TEST-123456789,FirmVer=test-version,~DeviceName=C3-200");
}
EXPORT int GetDeviceData(void *handle, unsigned char *buffer, int size,
                         const char *table, const char *fields, const char *filter, const char *options) {
    /* Match the official demo/native token, not the guide's spaced label. */
    if (options && *options && strcmp(options, "NewRecord") != 0) return -108;
    return write_buffer(buffer, size, "history-buffer-payload-longer-than-one-byte") < 0 ? -1 : 1;
}
EXPORT int GetRTLog(void *handle, unsigned char *buffer, int size) {
    return write_buffer(buffer, size, "realtime-buffer-payload-longer-than-one-byte");
}
