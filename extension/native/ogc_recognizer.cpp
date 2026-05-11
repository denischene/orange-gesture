// Orange Gesture Control — native recognizer port to WebAssembly.
// Reproduces the 8-direction tokenizer historically shipped as a C++ XPCOM
// component (Iogc_xpcom). Compiled with Emscripten and loaded from the MV3
// service worker via WebAssembly.instantiateStreaming.
//
// Build (see scripts/build-wasm.sh):
//   emcc ogc_recognizer.cpp -O3 -s WASM=1 -s STANDALONE_WASM=1 \
//        -s EXPORTED_FUNCTIONS='["_ogc_reset","_ogc_add_point","_ogc_token_count","_ogc_token_at","_ogc_buffer"]' \
//        --no-entry -o ogc_recognizer.wasm

#include <math.h>
#include <stdint.h>

#define MAX_TOKENS 64
#define MIN_SEGMENT 24.0

// Direction codes match the JS fallback (R=0, UR=1, U=2, UL=3, L=4, DL=5, D=6, DR=7).
static uint8_t  g_tokens[MAX_TOKENS];
static uint32_t g_count       = 0;
static double   g_last_x      = 0.0;
static double   g_last_y      = 0.0;
static int      g_has_last    = 0;

static inline uint8_t angle_to_dir(double dx, double dy) {
    double a = atan2(-dy, dx) * 180.0 / M_PI;
    double n = a;
    while (n < 0)    n += 360.0;
    while (n >= 360) n -= 360.0;
    if (n <  22.5 || n >= 337.5) return 0; // R
    if (n <  67.5)               return 1; // UR
    if (n < 112.5)               return 2; // U
    if (n < 157.5)               return 3; // UL
    if (n < 202.5)               return 4; // L
    if (n < 247.5)               return 5; // DL
    if (n < 292.5)               return 6; // D
    return 7;                              // DR
}

extern "C" {

void ogc_reset(void) {
    g_count    = 0;
    g_has_last = 0;
}

// Returns 1 if a new direction token was appended, 0 otherwise.
int ogc_add_point(double x, double y) {
    if (!g_has_last) {
        g_last_x   = x;
        g_last_y   = y;
        g_has_last = 1;
        return 0;
    }
    double dx = x - g_last_x;
    double dy = y - g_last_y;
    if (sqrt(dx * dx + dy * dy) < MIN_SEGMENT) return 0;

    uint8_t dir = angle_to_dir(dx, dy);
    g_last_x = x;
    g_last_y = y;

    if (g_count > 0 && g_tokens[g_count - 1] == dir) return 0;
    if (g_count >= MAX_TOKENS)                       return 0;

    g_tokens[g_count++] = dir;
    return 1;
}

uint32_t ogc_token_count(void) { return g_count; }

uint8_t ogc_token_at(uint32_t i) {
    if (i >= g_count) return 255;
    return g_tokens[i];
}

// Pointer to the internal token buffer (for bulk reads via HEAPU8).
uintptr_t ogc_buffer(void) { return (uintptr_t)g_tokens; }

} // extern "C"