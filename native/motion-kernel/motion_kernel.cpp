#include <cmath>
#include <emscripten/emscripten.h>

namespace {
constexpr double TAU = 6.283185307179586476925286766559;
constexpr double PI = 3.1415926535897932384626433832795;

double wrap01(double value) {
  double wrapped = std::fmod(value, 1.0);
  return wrapped < 0.0 ? wrapped + 1.0 : wrapped;
}

double oscillator(double phase, double phase_offset) {
  return std::sin(TAU * wrap01(phase + phase_offset));
}

double quadrature(double phase, double phase_offset) {
  return std::cos(TAU * wrap01(phase + phase_offset));
}

double promo_envelope(double phase, double active_fraction) {
  const double p = wrap01(phase);
  const double active = std::fmax(0.05, std::fmin(active_fraction, 0.95));
  if (p >= active) return 0.0;
  const double u = p / active;
  const double s = std::sin(PI * u);
  return s * s;
}
}

extern "C" {
EMSCRIPTEN_KEEPALIVE double mira_row_x(double phase, double phase_offset, double amplitude) {
  return amplitude * oscillator(phase, phase_offset);
}

EMSCRIPTEN_KEEPALIVE double mira_row_y(double phase, double phase_offset, double amplitude) {
  return amplitude * quadrature(phase, phase_offset);
}

EMSCRIPTEN_KEEPALIVE double mira_row_scale(double phase, double phase_offset, double amount) {
  return 1.0 + amount * 0.5 * (1.0 + oscillator(phase, phase_offset));
}

EMSCRIPTEN_KEEPALIVE double mira_row_brightness(double phase, double phase_offset, double amount) {
  return 1.0 + amount * 0.5 * (1.0 + quadrature(phase, phase_offset));
}

EMSCRIPTEN_KEEPALIVE double mira_promo_scale(double phase, double active_fraction, double amount) {
  return 1.0 + amount * promo_envelope(phase, active_fraction);
}

EMSCRIPTEN_KEEPALIVE double mira_promo_glow(double phase, double active_fraction) {
  return promo_envelope(phase, active_fraction);
}

EMSCRIPTEN_KEEPALIVE double mira_promo_wave_progress(double phase, double active_fraction) {
  const double p = wrap01(phase);
  const double active = std::fmax(0.05, std::fmin(active_fraction, 0.95));
  if (p >= active) return 0.0;
  return p / active;
}

EMSCRIPTEN_KEEPALIVE double mira_promo_wave_opacity(double phase, double active_fraction) {
  return promo_envelope(phase, active_fraction);
}
}
