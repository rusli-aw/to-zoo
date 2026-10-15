/**
 * To-Zoo — springs.
 *
 * A damped spring, after google/motive's spring and overshoot curves
 * (Apache-2.0): instead of easing to a target, a value is pulled toward it by
 * a spring and slowed by damping, so it can overshoot and settle. That is the
 * difference between a toy that *slides* into place and one that *boings*.
 *
 * Frequency is how fast it oscillates (Hz); damping ratio is how quickly the
 * wobble dies (1 = no overshoot, 0.3 = a lively bounce). Integrated
 * semi-implicitly with sub-steps, so a long frame cannot make it explode.
 */

export class Spring {
  /**
   * @param {number} value      starting value
   * @param {object} [opts]
   * @param {number} [opts.frequency]  Hz
   * @param {number} [opts.damping]    ratio, 0..1+
   */
  constructor(value = 0, { frequency = 3, damping = 0.4 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.frequency = frequency;
    this.damping = damping;
  }

  /** Add velocity, as if the value were flicked. */
  kick(amount) {
    this.velocity += amount;
    return this;
  }

  /** Jump to a value with no motion. */
  snap(value) {
    this.value = this.target = value;
    this.velocity = 0;
    return this;
  }

  /** @param {number} dt seconds */
  update(dt) {
    const omega = this.frequency * Math.PI * 2;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const accel = -omega * omega * (this.value - this.target) - 2 * this.damping * omega * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  get resting() {
    return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3;
  }
}
