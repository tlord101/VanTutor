import React from 'react';

export interface DiagramPrimitiveProps {
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  progress?: number; // 0.0 to 1.0 progressive build
  color?: string;
  activeId?: string;
  metadata?: any;
}

/**
 * Clean, high-contrast SVG Vector Diagrams for University Academic Disciplines.
 * Designed specifically for dark academic blackboard (#0A0F1D) with chalk-style vibrant colors.
 */
export const BoardDiagramPrimitives: React.FC<DiagramPrimitiveProps> = ({
  type,
  width = 360,
  height = 240,
  progress = 1.0,
  color = '#38BDF8',
  metadata,
}) => {
  const p = Math.min(1.0, Math.max(0.05, progress));

  switch (type) {
    // ── 1. PHYSICS: FORCE VECTORS & MASS ON INCLINE / SURFACE ──
    case 'physics_force_vectors':
    case 'force_vector':
    case 'newton_second_law': {
      const showF = p >= 0.3;
      const showN = p >= 0.6;
      const showW = p >= 0.8;
      const showA = p >= 0.95;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          <defs>
            <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#38BDF8" />
            </marker>
            <marker id="arrow-yellow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#FACC15" />
            </marker>
            <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#34D399" />
            </marker>
          </defs>

          {/* Ground Surface */}
          <line x1="20" y1="160" x2="340" y2="160" stroke="#475569" strokeWidth="2.5" strokeDasharray="4 4" />
          {/* Ground hatch marks */}
          {[40, 80, 120, 160, 200, 240, 280, 320].map((hx) => (
            <line key={hx} x1={hx} y1="160" x2={hx - 10} y2="175" stroke="#334155" strokeWidth="1.5" />
          ))}

          {/* Mass Block */}
          <rect
            x="130"
            y="95"
            width="100"
            height="65"
            rx="8"
            fill="#1E293B"
            stroke="#94A3B8"
            strokeWidth="2.5"
            className="transition-all duration-500"
          />
          <text x="180" y="134" textAnchor="middle" fill="#FFFFFF" fontSize="16" fontWeight="700" fontFamily="sans-serif">
            Mass (m)
          </text>

          {/* Applied Force Vector (F) */}
          {showF && (
            <g className="animate-in fade-in duration-300">
              <line x1="230" y1="127" x2="320" y2="127" stroke="#FACC15" strokeWidth="3" markerEnd="url(#arrow-yellow)" />
              <text x="280" y="115" fill="#FACC15" fontSize="14" fontWeight="bold">
                Force (F) →
              </text>
            </g>
          )}

          {/* Normal Force (N) */}
          {showN && (
            <g className="animate-in fade-in duration-300">
              <line x1="180" y1="95" x2="180" y2="25" stroke="#38BDF8" strokeWidth="2.5" markerEnd="url(#arrow-cyan)" />
              <text x="190" y="45" fill="#38BDF8" fontSize="13" fontWeight="bold">
                Normal (N)
              </text>
            </g>
          )}

          {/* Weight / Gravity (W = mg) */}
          {showW && (
            <g className="animate-in fade-in duration-300">
              <line x1="180" y1="160" x2="180" y2="210" stroke="#F87171" strokeWidth="2.5" markerEnd="url(#arrow-cyan)" />
              <text x="190" y="200" fill="#F87171" fontSize="13" fontWeight="bold">
                W = mg
              </text>
            </g>
          )}

          {/* Acceleration Result (a) */}
          {showA && (
            <g className="animate-in fade-in duration-300">
              <rect x="235" y="40" width="105" height="34" rx="6" fill="#064E3B" stroke="#34D399" strokeWidth="1.5" />
              <text x="287" y="62" textAnchor="middle" fill="#34D399" fontSize="12" fontWeight="bold">
                a = F / m ➔
              </text>
            </g>
          )}
        </svg>
      );
    }

    // ── 2. ELECTRICAL ENGINEERING: DC CIRCUIT SCHEMATIC ──
    case 'circuit':
    case 'circuit_schematic':
    case 'ohms_law': {
      const showR = p >= 0.4;
      const showI = p >= 0.7;
      const showValues = p >= 0.9;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          <defs>
            <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#60A5FA" />
            </marker>
          </defs>

          {/* Circuit Outer Wire Path */}
          <path
            d="M 60 110 L 60 40 L 140 40 M 220 40 L 300 40 L 300 180 L 60 180 L 60 130"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Voltage Source (Battery) on Left Wire */}
          <g transform="translate(45, 95)">
            <line x1="0" y1="10" x2="30" y2="10" stroke="#FACC15" strokeWidth="4" />
            <line x1="6" y1="25" x2="24" y2="25" stroke="#94A3B8" strokeWidth="2.5" />
            <text x="-25" y="14" fill="#FACC15" fontSize="14" fontWeight="bold">+ V -</text>
          </g>

          {/* Resistor on Top Wire (Zigzag) */}
          {showR && (
            <g className="animate-in fade-in duration-300">
              <path
                d="M 140 40 L 147 25 L 160 55 L 173 25 L 186 55 L 199 25 L 212 55 L 220 40"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <text x="180" y="16" textAnchor="middle" fill="#38BDF8" fontSize="14" fontWeight="bold">
                Resistor (R)
              </text>
            </g>
          )}

          {/* Current Flow Arrows (I) */}
          {showI && (
            <g className="animate-in fade-in duration-300">
              <line x1="240" y1="30" x2="280" y2="30" stroke="#34D399" strokeWidth="2.5" markerEnd="url(#arrow-blue)" />
              <text x="260" y="22" textAnchor="middle" fill="#34D399" fontSize="12" fontWeight="bold">
                Current (I) ➔
              </text>
            </g>
          )}

          {/* Ohm's Law Formula Callout */}
          {showValues && (
            <g transform="translate(115, 95)" className="animate-in zoom-in duration-300">
              <rect x="0" y="0" width="130" height="50" rx="10" fill="#1E293B" stroke="#FACC15" strokeWidth="1.5" />
              <text x="65" y="24" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="bold">
                Ohm's Law:
              </text>
              <text x="65" y="42" textAnchor="middle" fill="#FACC15" fontSize="14" fontWeight="bold" fontFamily="serif">
                V = I · R
              </text>
            </g>
          )}
        </svg>
      );
    }

    // ── 3. BIOLOGY: CELL ANATOMY & PHOTOSYNTHESIS ──
    case 'cell':
    case 'cell_anatomy':
    case 'biology_cell': {
      const showNucleus = p >= 0.3;
      const showMito = p >= 0.6;
      const showChloroplast = p >= 0.85;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          {/* Cell Membrane */}
          <ellipse cx="180" cy="110" rx="150" ry="90" fill="#0F172A" stroke="#38BDF8" strokeWidth="3" strokeDasharray={p < 1 ? "8 4" : "none"} />
          <ellipse cx="180" cy="110" rx="142" ry="83" fill="#132338" stroke="#0284C7" strokeWidth="1.5" opacity="0.6" />
          <text x="32" y="35" fill="#38BDF8" fontSize="11" fontWeight="bold">Cell Membrane</text>

          {/* Nucleus */}
          {showNucleus && (
            <g className="animate-in fade-in duration-300">
              <circle cx="140" cy="110" r="38" fill="#1E1B4B" stroke="#A855F7" strokeWidth="2.5" />
              <circle cx="140" cy="110" r="16" fill="#C084FC" opacity="0.8" />
              <text x="140" y="114" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">Nucleus</text>
            </g>
          )}

          {/* Mitochondria */}
          {showMito && (
            <g className="animate-in fade-in duration-300" transform="translate(235, 75)">
              <ellipse cx="0" cy="0" rx="28" ry="16" fill="#7C2D12" stroke="#FB923C" strokeWidth="2" />
              <path d="M -18 0 Q -10 -8 0 0 Q 10 8 18 0" fill="none" stroke="#FED7AA" strokeWidth="1.8" />
              <text x="0" y="28" textAnchor="middle" fill="#FB923C" fontSize="10" fontWeight="bold">Mitochondria</text>
            </g>
          )}

          {/* Chloroplast / Vacuole */}
          {showChloroplast && (
            <g className="animate-in fade-in duration-300" transform="translate(225, 145)">
              <ellipse cx="0" cy="0" rx="30" ry="17" fill="#064E3B" stroke="#34D399" strokeWidth="2" />
              <circle cx="-10" cy="0" r="4" fill="#6EE7B7" />
              <circle cx="0" cy="0" r="4" fill="#6EE7B7" />
              <circle cx="10" cy="0" r="4" fill="#6EE7B7" />
              <text x="0" y="27" textAnchor="middle" fill="#34D399" fontSize="10" fontWeight="bold">Chloroplast</text>
            </g>
          )}
        </svg>
      );
    }

    // ── 4. CHEMISTRY: ATOMIC BOHR MODEL & ELECTRON ORBITALS ──
    case 'atom':
    case 'atomic_structure':
    case 'chemistry_bohr': {
      const showInner = p >= 0.4;
      const showOuter = p >= 0.75;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          {/* Outer Shell Orbit */}
          {showOuter && (
            <circle cx="180" cy="110" r="85" fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="5 5" className="animate-in fade-in" />
          )}

          {/* Inner Shell Orbit */}
          {showInner && (
            <circle cx="180" cy="110" r="50" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 4" className="animate-in fade-in" />
          )}

          {/* Nucleus (Protons & Neutrons) */}
          <g transform="translate(180, 110)">
            <circle cx="0" cy="0" r="24" fill="#831843" stroke="#F43F5E" strokeWidth="2" />
            <circle cx="-6" cy="-5" r="7" fill="#FB7185" />
            <circle cx="6" cy="-4" r="7" fill="#38BDF8" />
            <circle cx="-2" cy="7" r="7" fill="#FB7185" />
            <text x="0" y="3" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="bold">p⁺ n⁰</text>
            <text x="0" y="38" textAnchor="middle" fill="#F43F5E" fontSize="11" fontWeight="bold">Nucleus</text>
          </g>

          {/* Inner Shell Electrons (2 max) */}
          {showInner && (
            <g className="animate-in zoom-in duration-300">
              <circle cx="180" cy="60" r="5.5" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="1" />
              <circle cx="180" cy="160" r="5.5" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="1" />
            </g>
          )}

          {/* Outer Shell Electrons */}
          {showOuter && (
            <g className="animate-in zoom-in duration-300">
              <circle cx="100" cy="80" r="6" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1.5" />
              <circle cx="260" cy="80" r="6" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1.5" />
              <circle cx="100" cy="140" r="6" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1.5" />
              <circle cx="260" cy="140" r="6" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1.5" />
              <text x="270" y="160" fill="#FACC15" fontSize="11" fontWeight="bold">Valence e⁻</text>
            </g>
          )}
        </svg>
      );
    }

    // ── 5. COMPUTER ENGINEERING: CPU ARCHITECTURE & PIPELINE ──
    case 'cpu':
    case 'computer_architecture':
    case 'von_neumann': {
      const showCU = p >= 0.3;
      const showALU = p >= 0.6;
      const showReg = p >= 0.85;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          {/* CPU Enclosing Border */}
          <rect x="25" y="20" width="310" height="180" rx="14" fill="#0F172A" stroke="#38BDF8" strokeWidth="2.5" />
          <text x="45" y="42" fill="#38BDF8" fontSize="12" fontWeight="bold" letterSpacing="1">CENTRAL PROCESSING UNIT (CPU)</text>

          {/* Control Unit */}
          {showCU && (
            <g className="animate-in fade-in duration-300">
              <rect x="45" y="60" width="125" height="55" rx="8" fill="#1E293B" stroke="#A855F7" strokeWidth="2" />
              <text x="107" y="85" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="bold">Control Unit</text>
              <text x="107" y="102" textAnchor="middle" fill="#C084FC" fontSize="10">(Decodes & Directs)</text>
            </g>
          )}

          {/* ALU (Arithmetic Logic Unit) */}
          {showALU && (
            <g className="animate-in fade-in duration-300">
              <rect x="190" y="60" width="125" height="55" rx="8" fill="#1E293B" stroke="#FACC15" strokeWidth="2" />
              <text x="252" y="85" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="bold">ALU</text>
              <text x="252" y="102" textAnchor="middle" fill="#FDE047" fontSize="10">(Math & Logic Ops)</text>
            </g>
          )}

          {/* Registers & Internal Bus */}
          {showReg && (
            <g className="animate-in fade-in duration-300">
              <rect x="45" y="130" width="270" height="50" rx="8" fill="#1E293B" stroke="#34D399" strokeWidth="2" />
              <text x="180" y="152" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">Registers (PC, IR, ACC, MAR)</text>
              <text x="180" y="168" textAnchor="middle" fill="#34D399" fontSize="10">High-Speed CPU Memory</text>
            </g>
          )}
        </svg>
      );
    }

    // ── 6. ECONOMICS: SUPPLY & DEMAND EQUILIBRIUM ──
    case 'economics':
    case 'supply_demand':
    case 'market_equilibrium': {
      const showD = p >= 0.35;
      const showS = p >= 0.7;
      const showEq = p >= 0.9;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          {/* Axes */}
          <line x1="50" y1="25" x2="50" y2="180" stroke="#94A3B8" strokeWidth="2.5" />
          <line x1="50" y1="180" x2="330" y2="180" stroke="#94A3B8" strokeWidth="2.5" />
          <text x="35" y="30" fill="#94A3B8" fontSize="12" fontWeight="bold">P (Price)</text>
          <text x="290" y="200" fill="#94A3B8" fontSize="12" fontWeight="bold">Q (Quantity)</text>

          {/* Demand Curve (Downward Sloping) */}
          {showD && (
            <g className="animate-in fade-in duration-300">
              <line x1="70" y1="45" x2="290" y2="160" stroke="#F87171" strokeWidth="3" strokeLinecap="round" />
              <text x="300" y="165" fill="#F87171" fontSize="14" fontWeight="bold">Demand (D)</text>
            </g>
          )}

          {/* Supply Curve (Upward Sloping) */}
          {showS && (
            <g className="animate-in fade-in duration-300">
              <line x1="70" y1="160" x2="290" y2="45" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
              <text x="300" y="50" fill="#38BDF8" fontSize="14" fontWeight="bold">Supply (S)</text>
            </g>
          )}

          {/* Equilibrium Intersection Point */}
          {showEq && (
            <g className="animate-in zoom-in duration-300">
              <circle cx="180" cy="102.5" r="6" fill="#FACC15" stroke="#FFFFFF" strokeWidth="2" />
              <line x1="50" y1="102.5" x2="180" y2="102.5" stroke="#FACC15" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="180" y1="102.5" x2="180" y2="180" stroke="#FACC15" strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="25" y="106" fill="#FACC15" fontSize="11" fontWeight="bold">Pe</text>
              <text x="175" y="196" fill="#FACC15" fontSize="11" fontWeight="bold">Qe</text>
              <text x="190" y="96" fill="#FACC15" fontSize="12" fontWeight="bold">Equilibrium (E)</text>
            </g>
          )}
        </svg>
      );
    }

    // ── 7. MATHEMATICS: COORDINATE GRAPH WITH POLYNOMIAL / SINE CURVE ──
    case 'graph':
    case 'math_coordinate':
    case 'calculus_curve':
    default: {
      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          {/* Grid lines */}
          {[60, 100, 140, 180, 220, 260, 300].map((gx) => (
            <line key={gx} x1={gx} y1="20" x2={gx} y2="190" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />
          ))}
          {[50, 90, 130, 170].map((gy) => (
            <line key={gy} x1="40" y1={gy} x2="320" y2={gy} stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />
          ))}

          {/* Axes */}
          <line x1="40" y1="130" x2="330" y2="130" stroke="#94A3B8" strokeWidth="2" />
          <line x1="180" y1="20" x2="180" y2="195" stroke="#94A3B8" strokeWidth="2" />
          <text x="325" y="145" fill="#94A3B8" fontSize="12" fontWeight="bold">x</text>
          <text x="185" y="28" fill="#94A3B8" fontSize="12" fontWeight="bold">y</text>

          {/* Smooth Polynomial / Parabola Curve */}
          <path
            d="M 60 170 Q 180 30 300 170"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="transition-all duration-700"
          />

          {/* Vertex Highlight */}
          {p >= 0.5 && (
            <g className="animate-in zoom-in duration-300">
              <circle cx="180" cy="100" r="5.5" fill="#FACC15" stroke="#FFFFFF" strokeWidth="2" />
              <text x="190" y="95" fill="#FACC15" fontSize="11" fontWeight="bold">Vertex (h, k)</text>
            </g>
          )}
        </svg>
      );
    }
  }
};
