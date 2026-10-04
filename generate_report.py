#!/usr/bin/env python3
"""
ProctorAI Enterprise — Publication-Grade Technical Report Generator
====================================================================
Generates a comprehensive, multi-page PDF report documenting the architecture,
methodology, and file-level implementation of the AI-Based Automated Online
Proctoring System.

Author : Sayeem Raza
Library: ReportLab + Matplotlib
Output : ProctorAI_Technical_Report.pdf
"""

import os
import io
import math
import textwrap
from datetime import datetime

# ─── ReportLab imports ─────────────────────────────────────────────────────────
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    Image, KeepTogether, HRFlowable, ListFlowable, ListItem, Flowable
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon, Circle, Group
from reportlab.graphics import renderPDF
from reportlab.pdfgen import canvas as pdfcanvas

# ─── Matplotlib for embedded charts ───────────────────────────────────────────
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

# ═════════════════════════════════════════════════════════════════════════════
#  CONSTANTS & DESIGN TOKENS
# ═════════════════════════════════════════════════════════════════════════════

PAGE_W, PAGE_H = A4  # 595.27, 841.89 points
MARGIN = 60

# Color Palette — Deep Navy Corporate Theme
C_NAVY       = colors.HexColor('#1A365D')
C_DARK_NAVY  = colors.HexColor('#0F2440')
C_ACCENT     = colors.HexColor('#2B6CB0')
C_LIGHT_BLUE = colors.HexColor('#3182CE')
C_SLATE      = colors.HexColor('#4A5568')
C_GREY       = colors.HexColor('#718096')
C_LIGHT_GREY = colors.HexColor('#E2E8F0')
C_BG_ROW     = colors.HexColor('#F7FAFC')
C_WHITE      = colors.white
C_BLACK      = colors.HexColor('#1A202C')
C_SUCCESS    = colors.HexColor('#38A169')
C_WARNING    = colors.HexColor('#D69E2E')
C_DANGER     = colors.HexColor('#E53E3E')
C_PURPLE     = colors.HexColor('#805AD5')
C_TEAL       = colors.HexColor('#319795')
C_ORANGE     = colors.HexColor('#DD6B20')
C_PINK       = colors.HexColor('#D53F8C')

# ═════════════════════════════════════════════════════════════════════════════
#  CUSTOM STYLES
# ═════════════════════════════════════════════════════════════════════════════

styles = getSampleStyleSheet()

styles.add(ParagraphStyle(
    'DocTitle', fontName='Helvetica-Bold', fontSize=28, leading=34,
    textColor=C_NAVY, alignment=TA_CENTER, spaceAfter=6
))
styles.add(ParagraphStyle(
    'DocSubtitle', fontName='Helvetica', fontSize=13, leading=18,
    textColor=C_GREY, alignment=TA_CENTER, spaceAfter=20
))
styles.add(ParagraphStyle(
    'H1', fontName='Helvetica-Bold', fontSize=20, leading=26,
    textColor=C_NAVY, spaceBefore=24, spaceAfter=12,
    borderPadding=(0, 0, 4, 0)
))
styles.add(ParagraphStyle(
    'H2', fontName='Helvetica-Bold', fontSize=15, leading=20,
    textColor=C_ACCENT, spaceBefore=18, spaceAfter=8
))
styles.add(ParagraphStyle(
    'H3', fontName='Helvetica-Bold', fontSize=12, leading=16,
    textColor=C_SLATE, spaceBefore=12, spaceAfter=6
))
styles.add(ParagraphStyle(
    'Body', fontName='Helvetica', fontSize=10, leading=15,
    textColor=C_SLATE, alignment=TA_JUSTIFY, spaceAfter=8
))
styles.add(ParagraphStyle(
    'BodyBold', fontName='Helvetica-Bold', fontSize=10, leading=15,
    textColor=C_SLATE, spaceAfter=8
))
styles.add(ParagraphStyle(
    'Mono', fontName='Courier', fontSize=9, leading=13,
    textColor=C_ACCENT, spaceAfter=4, leftIndent=12
))
styles.add(ParagraphStyle(
    'Caption', fontName='Helvetica-Oblique', fontSize=9, leading=12,
    textColor=C_GREY, alignment=TA_CENTER, spaceAfter=12
))
styles.add(ParagraphStyle(
    'BulletBody', fontName='Helvetica', fontSize=10, leading=15,
    textColor=C_SLATE, alignment=TA_JUSTIFY, spaceAfter=4,
    leftIndent=20, bulletIndent=10
))
styles.add(ParagraphStyle(
    'TableHeader', fontName='Helvetica-Bold', fontSize=9, leading=12,
    textColor=C_WHITE, alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    'TableCell', fontName='Helvetica', fontSize=8.5, leading=12,
    textColor=C_SLATE, alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    'TableCellMono', fontName='Courier', fontSize=8, leading=11,
    textColor=C_ACCENT, alignment=TA_LEFT
))
styles.add(ParagraphStyle(
    'Footer', fontName='Helvetica', fontSize=8, leading=10,
    textColor=C_GREY, alignment=TA_CENTER
))
styles.add(ParagraphStyle(
    'CalloutBody', fontName='Helvetica', fontSize=9.5, leading=14,
    textColor=C_SLATE, alignment=TA_LEFT, leftIndent=8, rightIndent=8,
    spaceAfter=4
))

# ═════════════════════════════════════════════════════════════════════════════
#  CUSTOM FLOWABLES
# ═════════════════════════════════════════════════════════════════════════════

class SectionDivider(Flowable):
    """A styled horizontal rule with gradient-like effect."""
    def __init__(self, width=None):
        Flowable.__init__(self)
        self.width = width or (PAGE_W - 2 * MARGIN)
        self.height = 3

    def draw(self):
        self.canv.setStrokeColor(C_ACCENT)
        self.canv.setLineWidth(2)
        self.canv.line(0, 1, self.width * 0.3, 1)
        self.canv.setStrokeColor(C_LIGHT_GREY)
        self.canv.setLineWidth(0.5)
        self.canv.line(self.width * 0.3, 1, self.width, 1)


class CalloutBox(Flowable):
    """An info/warning/tip callout box."""
    COLORS = {
        'info':    (colors.HexColor('#EBF8FF'), colors.HexColor('#3182CE'), '💡'),
        'warning': (colors.HexColor('#FFFAF0'), colors.HexColor('#DD6B20'), '⚠️'),
        'success': (colors.HexColor('#F0FFF4'), colors.HexColor('#38A169'), '✅'),
        'tip':     (colors.HexColor('#FAF5FF'), colors.HexColor('#805AD5'), '🔮'),
    }

    def __init__(self, text, kind='info', width=None):
        Flowable.__init__(self)
        self.text = text
        self.kind = kind
        self.box_width = width or (PAGE_W - 2 * MARGIN)
        bg, border, icon = self.COLORS.get(kind, self.COLORS['info'])
        self.bg_color = bg
        self.border_color = border
        self.icon = icon
        # Pre-calculate height
        self._lines = textwrap.wrap(text, width=90)
        self.box_height = max(40, len(self._lines) * 14 + 20)
        self.height = self.box_height + 8

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg_color)
        c.setStrokeColor(self.border_color)
        c.setLineWidth(1.5)
        c.roundRect(0, 0, self.box_width, self.box_height, 6, fill=1, stroke=1)
        # Left accent bar
        c.setFillColor(self.border_color)
        c.roundRect(0, 0, 5, self.box_height, 3, fill=1, stroke=0)
        # Text
        c.setFillColor(C_SLATE)
        c.setFont('Helvetica', 9)
        y = self.box_height - 16
        for line in self._lines:
            c.drawString(16, y, line)
            y -= 14


# ═════════════════════════════════════════════════════════════════════════════
#  DIAGRAM GENERATORS (Matplotlib → ReportLab Image)
# ═════════════════════════════════════════════════════════════════════════════

def _fig_to_image(fig, width=480, height=280):
    """Convert a matplotlib figure to a ReportLab Image flowable."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=180, bbox_inches='tight',
                facecolor='#FFFFFF', edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    img = Image(buf, width=width, height=height)
    return img


def create_system_architecture_diagram():
    """Render the high-level system architecture pipeline diagram."""
    fig, ax = plt.subplots(figsize=(10, 5.2))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')
    fig.patch.set_facecolor('#FFFFFF')

    # Title
    ax.text(5, 5.2, 'ProctorAI — System Architecture Overview', fontsize=14,
            fontweight='bold', ha='center', color='#1A365D')

    # ─── Three-tier boxes ──────────────────────────────────────────────────
    tiers = [
        {'label': '[CLIENT]  Candidate\n(Electron Desktop)', 'x': 0.3, 'y': 2.6, 'w': 2.6, 'h': 2.0,
         'color': '#EBF8FF', 'border': '#3182CE',
         'items': ['Webcam Capture', 'Code Editor & IDE', 'Kiosk Lockdown', 'WebRTC Peer']},
        {'label': '[SERVER]  Backend\n(Node.js + Socket.IO)', 'x': 3.7, 'y': 2.6, 'w': 2.6, 'h': 2.0,
         'color': '#F0FFF4', 'border': '#38A169',
         'items': ['REST API Routes', 'WebSocket Broker', 'Trust Score Engine', 'MongoDB Store']},
        {'label': '[DASH]  Interviewer\n(React + Vite)', 'x': 7.1, 'y': 2.6, 'w': 2.6, 'h': 2.0,
         'color': '#FAF5FF', 'border': '#805AD5',
         'items': ['WebRTC Live Video', 'Alert Timeline', 'Report Generator', 'Question Bank']},
    ]

    for t in tiers:
        rect = FancyBboxPatch((t['x'], t['y']), t['w'], t['h'],
                              boxstyle='round,pad=0.08', linewidth=1.5,
                              edgecolor=t['border'], facecolor=t['color'])
        ax.add_patch(rect)
        ax.text(t['x'] + t['w']/2, t['y'] + t['h'] - 0.22, t['label'],
                ha='center', va='top', fontsize=8.5, fontweight='bold', color='#1A365D')
        for i, item in enumerate(t['items']):
            ax.text(t['x'] + 0.15, t['y'] + t['h'] - 0.60 - i*0.32, f'• {item}',
                    fontsize=7, color='#4A5568', va='top')

    # ─── AI Engine box (below candidate) ───────────────────────────────────
    ai_rect = FancyBboxPatch((0.6, 0.3), 2.0, 1.6,
                             boxstyle='round,pad=0.08', linewidth=1.5,
                             edgecolor='#E53E3E', facecolor='#FFF5F5')
    ax.add_patch(ai_rect)
    ax.text(1.6, 1.7, '[AI]  Vision Engine\n(Python)', ha='center', va='top',
            fontsize=8.5, fontweight='bold', color='#1A365D')
    for i, item in enumerate(['OpenCV + MediaPipe', 'Face Detection', 'Gaze Tracking', 'Head Pose (PnP)']):
        ax.text(0.75, 1.20 - i*0.27, f'• {item}', fontsize=7, color='#4A5568')

    # ─── Arrows ────────────────────────────────────────────────────────────
    arrow_kw = dict(arrowstyle='->', color='#2B6CB0', lw=1.8,
                    connectionstyle='arc3,rad=0.0', mutation_scale=14)

    # Candidate → Backend (Socket.IO)
    ax.annotate('', xy=(3.7, 3.6), xytext=(2.9, 3.6), arrowprops=arrow_kw)
    ax.text(3.3, 3.8, 'Socket.IO\nTelemetry', ha='center', fontsize=6.5, color='#2B6CB0', style='italic')

    # Backend → Dashboard (Broadcast)
    ax.annotate('', xy=(7.1, 3.6), xytext=(6.3, 3.6), arrowprops=arrow_kw)
    ax.text(6.7, 3.8, 'Alert\nBroadcast', ha='center', fontsize=6.5, color='#2B6CB0', style='italic')

    # Candidate → Dashboard (WebRTC, curved)
    ax.annotate('', xy=(7.5, 4.6), xytext=(2.5, 4.6),
                arrowprops=dict(arrowstyle='->', color='#805AD5', lw=1.2,
                                connectionstyle='arc3,rad=-0.15', mutation_scale=12, linestyle='dashed'))
    ax.text(5.0, 5.0, 'WebRTC P2P Video Stream (Simple-Peer)', ha='center',
            fontsize=7, color='#805AD5', style='italic')

    # AI Engine → Candidate (IPC)
    ax.annotate('', xy=(1.6, 2.6), xytext=(1.6, 1.9),
                arrowprops=dict(arrowstyle='->', color='#E53E3E', lw=1.5, mutation_scale=12))
    ax.text(2.3, 2.25, 'JSON\nStdout IPC', fontsize=6.5, color='#E53E3E', style='italic')

    return _fig_to_image(fig, width=460, height=240)


def create_detection_pipeline_diagram():
    """Render the AI detection pipeline flowchart."""
    fig, ax = plt.subplots(figsize=(10, 4.0))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.0)
    ax.axis('off')
    fig.patch.set_facecolor('#FFFFFF')

    ax.text(5, 3.75, 'AI Detection Pipeline — Frame-by-Frame Analysis', fontsize=13,
            fontweight='bold', ha='center', color='#1A365D')

    # Pipeline steps
    steps = [
        ('1. Frame\nCapture', '#EBF8FF', '#3182CE', 0.2, 1.0),
        ('2. BGR>RGB\nConversion', '#F0FFF4', '#38A169', 2.0, 1.0),
        ('3. Face\nDetection', '#FFF5F5', '#E53E3E', 3.8, 1.0),
        ('4. Landmark\nExtraction', '#FFFAF0', '#DD6B20', 5.6, 1.0),
        ('5. Gaze +\nHead Pose', '#FAF5FF', '#805AD5', 7.4, 1.0),
    ]

    for label, bg, border, x, y in steps:
        rect = FancyBboxPatch((x, y), 1.5, 1.5, boxstyle='round,pad=0.08',
                              linewidth=1.5, edgecolor=border, facecolor=bg)
        ax.add_patch(rect)
        ax.text(x + 0.75, y + 0.75, label, ha='center', va='center',
                fontsize=8, fontweight='bold', color='#1A365D')

    # Arrows between steps
    for i in range(len(steps) - 1):
        x1 = steps[i][3] + 1.5
        x2 = steps[i+1][3]
        y = 1.75
        ax.annotate('', xy=(x2, y), xytext=(x1, y),
                    arrowprops=dict(arrowstyle='->', color='#2B6CB0', lw=1.5, mutation_scale=12))

    # Decision diamond below
    diamond_x, diamond_y = 5.6, -0.2
    diamond = plt.Polygon(
        [(diamond_x + 0.75, diamond_y + 1.0),
         (diamond_x + 1.5, diamond_y + 0.5),
         (diamond_x + 0.75, diamond_y),
         (diamond_x, diamond_y + 0.5)],
        closed=True, facecolor='#FFFAF0', edgecolor='#DD6B20', linewidth=1.5
    )
    ax.add_patch(diamond)
    ax.text(diamond_x + 0.75, diamond_y + 0.5, 'Threshold\nBreach?', ha='center',
            va='center', fontsize=7, fontweight='bold', color='#1A365D')

    # Arrow from Gaze to Decision
    ax.annotate('', xy=(diamond_x + 0.75, diamond_y + 1.0), xytext=(steps[-1][3] + 0.75, 1.0),
                arrowprops=dict(arrowstyle='->', color='#DD6B20', lw=1.5, mutation_scale=12))

    # Yes/No branches
    # "Yes" → Alert
    alert_rect = FancyBboxPatch((7.8, -0.2), 1.5, 1.0, boxstyle='round,pad=0.06',
                                linewidth=1.5, edgecolor='#E53E3E', facecolor='#FFF5F5')
    ax.add_patch(alert_rect)
    ax.text(8.55, 0.3, '[!] Emit\nAlert Event', ha='center', va='center',
            fontsize=8, fontweight='bold', color='#E53E3E')
    ax.annotate('', xy=(7.8, 0.3), xytext=(diamond_x + 1.5, 0.5),
                arrowprops=dict(arrowstyle='->', color='#E53E3E', lw=1.3, mutation_scale=12))
    ax.text(7.3, 0.7, 'YES', fontsize=7, fontweight='bold', color='#E53E3E')

    # "No" → Continue
    cont_rect = FancyBboxPatch((3.6, -0.2), 1.5, 1.0, boxstyle='round,pad=0.06',
                               linewidth=1.5, edgecolor='#38A169', facecolor='#F0FFF4')
    ax.add_patch(cont_rect)
    ax.text(4.35, 0.3, '[OK] Continue\nMonitoring', ha='center', va='center',
            fontsize=8, fontweight='bold', color='#38A169')
    ax.annotate('', xy=(5.1, 0.3), xytext=(diamond_x, 0.5),
                arrowprops=dict(arrowstyle='->', color='#38A169', lw=1.3, mutation_scale=12))
    ax.text(5.3, 0.7, 'NO', fontsize=7, fontweight='bold', color='#38A169')

    return _fig_to_image(fig, width=460, height=185)


def create_trust_score_chart():
    """Render a sample trust score decay chart."""
    fig, ax = plt.subplots(figsize=(6, 3))
    fig.patch.set_facecolor('#FFFFFF')

    events = ['Start', 'Gaze\n(−5)', 'Gaze\n(−5)', 'No Face\n(−15)', 'Multi\n(−20)',
              'Alt-Tab\n(−10)', 'Gaze\n(−5)', 'Gaze\n(−5)']
    scores = [100, 95, 90, 75, 55, 45, 40, 35]

    # Gradient colors based on score
    bar_colors = []
    for s in scores:
        if s >= 80: bar_colors.append('#38A169')
        elif s >= 50: bar_colors.append('#D69E2E')
        else: bar_colors.append('#E53E3E')

    ax.bar(range(len(events)), scores, color=bar_colors, width=0.6, edgecolor='white', linewidth=0.5)
    ax.plot(range(len(events)), scores, color='#2B6CB0', linewidth=2, marker='o', markersize=5, zorder=5)

    ax.set_xticks(range(len(events)))
    ax.set_xticklabels(events, fontsize=7, color='#4A5568')
    ax.set_ylabel('Trust Score', fontsize=9, color='#1A365D', fontweight='bold')
    ax.set_title('Dynamic Trust Score Decay — Sample Session', fontsize=11,
                 fontweight='bold', color='#1A365D', pad=10)
    ax.set_ylim(0, 110)
    ax.axhline(y=50, color='#E53E3E', linestyle='--', linewidth=0.8, alpha=0.6)
    ax.text(len(events) - 0.5, 52, 'Critical Threshold', fontsize=7, color='#E53E3E', ha='right')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#E2E8F0')
    ax.spines['bottom'].set_color('#E2E8F0')
    ax.tick_params(colors='#718096')
    ax.grid(axis='y', alpha=0.3, color='#E2E8F0')
    fig.tight_layout()

    return _fig_to_image(fig, width=380, height=190)


def create_tech_stack_chart():
    """Render a tech stack category donut chart."""
    fig, ax = plt.subplots(figsize=(5, 5))
    fig.patch.set_facecolor('#FFFFFF')

    labels = ['Computer\nVision', 'Frontend\n(React)', 'Backend\n(Node.js)', 'Desktop\n(Electron)',
              'Database\n(MongoDB)', 'Real-Time\n(WebRTC)']
    sizes = [25, 20, 20, 15, 10, 10]
    clrs = ['#E53E3E', '#805AD5', '#38A169', '#3182CE', '#DD6B20', '#D53F8C']
    explode = (0.05, 0.05, 0.05, 0.05, 0.05, 0.05)

    wedges, texts, autotexts = ax.pie(
        sizes, explode=explode, labels=labels, autopct='%1.0f%%',
        colors=clrs, startangle=90, pctdistance=0.78,
        wedgeprops=dict(width=0.45, edgecolor='white', linewidth=2)
    )
    for t in texts: t.set_fontsize(8); t.set_color('#1A365D'); t.set_fontweight('bold')
    for t in autotexts: t.set_fontsize(7); t.set_color('white'); t.set_fontweight('bold')

    ax.text(0, 0, 'ProctorAI\nTech Stack', ha='center', va='center',
            fontsize=11, fontweight='bold', color='#1A365D')
    ax.set_title('Technology Distribution', fontsize=13, fontweight='bold',
                 color='#1A365D', pad=15)

    return _fig_to_image(fig, width=260, height=260)


# ═════════════════════════════════════════════════════════════════════════════
#  PAGE TEMPLATE (Header / Footer / Page Numbers)
# ═════════════════════════════════════════════════════════════════════════════

def header_footer(canvas, doc):
    """Draw running header, footer, and page numbers on every page."""
    canvas.saveState()
    page_num = doc.page

    # ─── Header ────────────────────────────────────────────────────────────
    if page_num > 1:
        canvas.setStrokeColor(C_LIGHT_GREY)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 38, PAGE_W - MARGIN, PAGE_H - 38)
        canvas.setFillColor(C_GREY)
        canvas.setFont('Helvetica', 7.5)
        canvas.drawString(MARGIN, PAGE_H - 34, 'ProctorAI Enterprise — Technical Architecture Report')
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 34,
                               f'Confidential • {datetime.now().strftime("%B %Y")}')

    # ─── Footer ────────────────────────────────────────────────────────────
    canvas.setStrokeColor(C_LIGHT_GREY)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 35, PAGE_W - MARGIN, 35)
    canvas.setFillColor(C_GREY)
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(MARGIN, 22, '© 2026 ProctorAI • Sayeem Raza • MIT License')
    canvas.drawRightString(PAGE_W - MARGIN, 22, f'Page {page_num}')

    canvas.restoreState()


# ═════════════════════════════════════════════════════════════════════════════
#  HELPER: Build styled table
# ═════════════════════════════════════════════════════════════════════════════

def styled_table(headers, rows, col_widths=None):
    """Create a professionally styled table with alternating row colors."""
    header_row = [Paragraph(h, styles['TableHeader']) for h in headers]
    data = [header_row]

    for row in rows:
        data.append([Paragraph(str(cell), styles['TableCell']) for cell in row])

    if col_widths is None:
        col_widths = [(PAGE_W - 2 * MARGIN) / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), C_NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), C_WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'LEFT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, C_LIGHT_GREY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]
    # Alternating row colors
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), C_BG_ROW))

    t.setStyle(TableStyle(style_cmds))
    return t


def bullet(text):
    """Return a bullet-pointed paragraph."""
    return Paragraph(f'<bullet>&bull;</bullet> {text}', styles['BulletBody'])


# ═════════════════════════════════════════════════════════════════════════════
#  CONTENT BUILDERS
# ═════════════════════════════════════════════════════════════════════════════

def build_cover_page():
    """Generate the cover/title page elements."""
    elements = []
    elements.append(Spacer(1, 120))
    elements.append(Paragraph('🛡️', ParagraphStyle('Shield', fontName='Helvetica', fontSize=48,
                                                     alignment=TA_CENTER, spaceAfter=8)))
    elements.append(Paragraph('ProctorAI Enterprise', styles['DocTitle']))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        'AI-Based Automated Online Proctoring System:<br/>'
        'Architecture, Methodology, and File-Level Implementation',
        styles['DocSubtitle']))
    elements.append(Spacer(1, 12))
    elements.append(HRFlowable(width='40%', thickness=1.5, color=C_ACCENT,
                               spaceAfter=12, spaceBefore=0, hAlign='CENTER'))
    elements.append(Spacer(1, 8))

    meta_data = [
        ['Document Type', 'Technical Architecture Report'],
        ['Version', '2.0.0'],
        ['Author', 'Sayeem Raza'],
        ['Date', datetime.now().strftime('%B %d, %Y')],
        ['Classification', 'Academic / Portfolio — Publication Grade'],
        ['License', 'MIT Open Source License'],
    ]
    meta_table = Table(meta_data, colWidths=[150, 260])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), C_NAVY),
        ('TEXTCOLOR', (1, 0), (1, -1), C_SLATE),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    elements.append(meta_table)

    elements.append(Spacer(1, 30))

    # Tech stack badges as text
    elements.append(Paragraph(
        '<font color="#2B6CB0"><b>Core Stack:</b></font> '
        'Python &bull; OpenCV &bull; MediaPipe &bull; Node.js &bull; Express &bull; '
        'Socket.IO &bull; Electron &bull; React &bull; Vite &bull; MongoDB &bull; WebRTC',
        ParagraphStyle('StackLine', fontName='Helvetica', fontSize=9, leading=13,
                       textColor=C_SLATE, alignment=TA_CENTER, spaceAfter=6)
    ))

    elements.append(PageBreak())
    return elements


def build_toc():
    """Generate a table of contents."""
    elements = []
    elements.append(Paragraph('Table of Contents', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 12))

    toc_items = [
        ('1.', 'Executive Summary & Problem Statement'),
        ('2.', 'System Architecture & High-Level Workflow'),
        ('3.', 'Technology Stack & Methodology'),
        ('4.', 'AI Vision Pipeline — Core Algorithms'),
        ('5.', 'Detection Matrix & Trust Scoring Engine'),
        ('6.', 'Comprehensive File-by-File Architecture'),
        ('7.', 'WebRTC Real-Time Video & Signaling'),
        ('8.', 'Security & Kiosk Lockdown Model'),
        ('9.', 'Edge Cases & Anti-Spoofing Strategies'),
        ('10.', 'Database Schema & Data Model'),
        ('11.', 'AI-Powered Evaluation (Gemini Integration)'),
        ('12.', 'Setup, Deployment & Quick Start'),
        ('13.', 'Scalability & Future Improvements'),
    ]

    for num, title in toc_items:
        elements.append(Paragraph(
            f'<font color="#1A365D"><b>{num}</b></font>&nbsp;&nbsp;'
            f'<font color="#4A5568">{title}</font>',
            ParagraphStyle('TOCItem', fontName='Helvetica', fontSize=11, leading=20,
                           textColor=C_SLATE, leftIndent=20, spaceAfter=2)
        ))

    elements.append(PageBreak())
    return elements


def build_executive_summary():
    """Section 1: Executive Summary."""
    elements = []
    elements.append(Paragraph('1. Executive Summary & Problem Statement', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'Remote online examinations and technical interviews have become the dominant modality for '
        'academic assessments, professional certifications, and technical hiring across the globe. '
        'However, this shift introduces significant integrity challenges: candidates may seek assistance '
        'from unauthorized persons, reference external materials, switch browser tabs, or use communication '
        'devices—all of which undermine the credibility of the evaluation process.',
        styles['Body']))

    elements.append(Paragraph(
        '<b>ProctorAI Enterprise</b> is an end-to-end intelligent proctoring and assessment platform '
        'designed to address these challenges without requiring a human proctor to manually review hours '
        'of recorded footage. The system leverages real-time computer vision, behavioral analysis, and a '
        'dynamic trust scoring algorithm to continuously assess candidate integrity throughout an examination '
        'session.',
        styles['Body']))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('1.1 Core Objectives', styles['H2']))
    objectives = [
        '<b>Integrity Assurance:</b> Automatically detect and flag suspicious behaviors including face absence, '
        'multiple persons, off-screen gaze, and application switching in real-time.',
        '<b>Low False-Positive Rate:</b> Employ threshold-based validation with frame-skipping and ratio-based '
        'heuristics to minimize spurious alerts that disrupt legitimate candidates.',
        '<b>Sub-Second Latency:</b> Process webcam frames at 5-frame intervals with MediaPipe\'s lightweight '
        'inference engine, ensuring detection feedback within 200ms on standard hardware.',
        '<b>Zero-Configuration Deployment:</b> Auto-detecting MongoDB (Atlas → Local → In-Memory) and graceful '
        'Python fallback ensure the system operates out-of-the-box without manual setup.',
        '<b>Comprehensive Audit Trail:</b> Every violation event is timestamped, persisted to the database, and '
        'streamed to the interviewer dashboard for real-time and post-session review.',
    ]
    for obj in objectives:
        elements.append(bullet(obj))

    elements.append(Spacer(1, 8))
    elements.append(CalloutBox(
        'ProctorAI processes video frames entirely client-side via the Python AI engine, transmitting '
        'only lightweight JSON event payloads to the backend. No raw video data is stored server-side, '
        'preserving candidate privacy while enabling full behavioral analysis.',
        kind='info'))

    elements.append(PageBreak())
    return elements


def build_architecture():
    """Section 2: System Architecture."""
    elements = []
    elements.append(Paragraph('2. System Architecture & High-Level Workflow', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'ProctorAI employs a <b>three-tier distributed architecture</b> consisting of a secure '
        'Electron desktop client, a real-time Node.js backend, and a React-based interviewer dashboard. '
        'A fourth subsystem—the Python AI Vision Engine—runs as a child process on the candidate\'s machine, '
        'performing all computationally intensive computer vision tasks locally.',
        styles['Body']))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('Figure 1: System Architecture Overview', styles['Caption']))
    elements.append(create_system_architecture_diagram())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph('2.1 Data Flow Summary', styles['H2']))
    flow_steps = [
        '<b>Step 1 — Frame Capture:</b> The Electron client accesses the candidate\'s webcam via the '
        'getUserMedia API and pipes the video stream to the Python AI engine over IPC (stdin/stdout).',
        '<b>Step 2 — AI Inference:</b> The Python process runs MediaPipe Face Detection and Face Mesh '
        'on every 5th frame, computing face count, landmark positions, and gaze ratios.',
        '<b>Step 3 — Event Emission:</b> Detected anomalies are serialized as JSON events and emitted '
        'to the Electron renderer process via stdout IPC.',
        '<b>Step 4 — Socket Relay:</b> The renderer forwards violation events to the backend via '
        'Socket.IO (proctor namespace), which persists them as Log documents in MongoDB.',
        '<b>Step 5 — Trust Score Update:</b> The backend applies severity-weighted penalties to the '
        'candidate\'s trust score and broadcasts the updated score to all connected dashboard clients.',
        '<b>Step 6 — Dashboard Display:</b> The React interviewer dashboard renders real-time alerts, '
        'severity badges, and trust score gauges as events arrive via WebSocket.',
    ]
    for step in flow_steps:
        elements.append(bullet(step))

    elements.append(PageBreak())
    return elements


def build_tech_stack():
    """Section 3: Technology Stack."""
    elements = []
    elements.append(Paragraph('3. Technology Stack & Methodology', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'The technology stack is carefully curated to balance real-time performance, cross-platform '
        'compatibility, and developer ergonomics. Each layer addresses a specific domain concern:',
        styles['Body']))

    elements.append(Spacer(1, 4))

    tech_headers = ['Layer', 'Technologies', 'Purpose']
    tech_rows = [
        ['Candidate Desktop', 'Electron, HTML5, CSS3, JavaScript (ES6+)', 'Secure kiosk exam terminal with lockdown'],
        ['AI Vision Engine', 'Python 3.9+, OpenCV (cv2), Google MediaPipe', 'Face detection, gaze tracking, head pose estimation'],
        ['Interviewer Dashboard', 'React 18, Vite, Tailwind CSS, Lucide Icons', 'Real-time monitoring, reports, question management'],
        ['Backend & Real-Time', 'Node.js, Express.js, Socket.IO, HTTP/CORS', 'REST API, WebSocket broker, session management'],
        ['Database', 'MongoDB, Mongoose, mongodb-memory-server', 'Persistent storage with zero-config fallback'],
        ['Media Streaming', 'WebRTC, Simple-Peer, ICE/STUN', 'Peer-to-peer audio/video between candidate and interviewer'],
        ['AI Evaluation', 'Google Gemini API (2.5 Flash)', 'Code evaluation, question generation, follow-up suggestions'],
        ['Code Execution', 'Judge0 CE API / Gemini Simulation', 'Sandboxed code compilation and execution'],
        ['DevOps', 'PowerShell 7, Batch Scripts, Git', 'One-click launch, process management, auto-sync'],
    ]
    elements.append(styled_table(tech_headers, tech_rows, col_widths=[100, 180, 195]))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph('Figure 2: Technology Distribution', styles['Caption']))
    elements.append(create_tech_stack_chart())

    elements.append(PageBreak())
    return elements


def build_vision_pipeline():
    """Section 4: AI Vision Pipeline."""
    elements = []
    elements.append(Paragraph('4. AI Vision Pipeline — Core Algorithms', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'The AI Vision Engine (<font face="Courier" color="#2B6CB0">proctor.py</font>) implements a '
        'multi-stage detection pipeline that processes webcam frames in real-time. The engine operates '
        'in two modes: <b>Real Mode</b> (with OpenCV + MediaPipe) and <b>Mock Mode</b> (synthetic events '
        'for testing when dependencies are unavailable).',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('Figure 3: Detection Pipeline Flowchart', styles['Caption']))
    elements.append(create_detection_pipeline_diagram())
    elements.append(Spacer(1, 8))

    # 4.1 Face Detection
    elements.append(Paragraph('4.1 Face Detection & Counting', styles['H2']))
    elements.append(Paragraph(
        'MediaPipe Face Detection (short-range model, <font face="Courier">model_selection=0</font>) is '
        'applied to each processed frame with a minimum confidence threshold of 0.5. The detector returns '
        'bounding box coordinates for all detected faces in the frame.',
        styles['Body']))
    elements.append(bullet(
        '<b>Zero faces detected (no_face):</b> Indicates the candidate has left the camera frame. '
        'Classified as HIGH severity with an immediate −15 point trust penalty.'))
    elements.append(bullet(
        '<b>Multiple faces detected (multiple_faces):</b> Indicates an unauthorized person is present. '
        'Classified as HIGH severity with a −20 point trust penalty.'))

    # 4.2 Gaze Tracking
    elements.append(Paragraph('4.2 Gaze & Head Pose Estimation', styles['H2']))
    elements.append(Paragraph(
        'When exactly one face is detected, the engine activates MediaPipe Face Mesh with '
        '<font face="Courier">refine_landmarks=True</font> to extract 478 facial landmarks including '
        'iris positions (landmarks 468-477). A simplified gaze heuristic computes the horizontal '
        'deflection ratio using three key landmarks:',
        styles['Body']))
    elements.append(Spacer(1, 4))

    gaze_headers = ['Landmark Index', 'Anatomical Position', 'Role in Computation']
    gaze_rows = [
        ['1', 'Nose Tip', 'Central reference point for yaw estimation'],
        ['234', 'Left Face Boundary', 'Left extent of the face contour'],
        ['454', 'Right Face Boundary', 'Right extent of the face contour'],
        ['468–472', 'Left Iris Center', 'Left eye gaze direction (refined)'],
        ['473–477', 'Right Iris Center', 'Right eye gaze direction (refined)'],
    ]
    elements.append(styled_table(gaze_headers, gaze_rows, col_widths=[90, 150, 235]))
    elements.append(Spacer(1, 8))

    elements.append(Paragraph('4.3 Gaze Ratio Algorithm', styles['H2']))
    elements.append(Paragraph(
        'The gaze deflection ratio is computed as: <font face="Courier" color="#2B6CB0">'
        'ratio = (nose.x − left.x) / (right.x − left.x)</font>. This normalizes the nose tip '
        'position relative to the face width. A centered gaze yields a ratio near 0.5, while significant '
        'lateral head rotation shifts the ratio below 0.3 or above 0.7—triggering an '
        '<font face="Courier">off_screen_gaze</font> event (MEDIUM severity, −5 points).',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(CalloutBox(
        'Frame Throttling: Only every 5th frame is processed (frame_count % 5 != 0 → skip). '
        'This reduces CPU load by ~80% on standard laptops while maintaining a responsive ~6 FPS '
        'analysis rate on a 30 FPS camera feed.',
        kind='tip'))

    elements.append(PageBreak())
    return elements


def build_detection_matrix():
    """Section 5: Detection Matrix & Trust Scoring."""
    elements = []
    elements.append(Paragraph('5. Detection Matrix & Trust Scoring Engine', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'The trust scoring engine maintains a per-session score initialized at 100 points. Each detected '
        'anomaly applies a severity-weighted penalty. The score is broadcast in real-time to all connected '
        'dashboard clients via Socket.IO.',
        styles['Body']))

    elements.append(Spacer(1, 6))
    det_headers = ['Event Code', 'Description', 'Severity', 'Penalty', 'Trigger Source']
    det_rows = [
        ['no_face', 'Candidate face left camera frame', 'HIGH', '−15 pts', 'AI Vision Engine'],
        ['multiple_faces', 'Additional person detected in view', 'HIGH', '−20 pts', 'AI Vision Engine'],
        ['off_screen_gaze', 'Head/gaze significantly deflected', 'MEDIUM', '−5 pts', 'AI Vision Engine'],
        ['window_switch_attempt', 'Alt+Tab / app switch / minimize', 'HIGH', '−10 pts', 'Electron Main Process'],
        ['keyboard_shortcut_attempt', 'Blocked shortcut intercepted', 'MEDIUM', '−5 pts', 'Renderer Keyboard Handler'],
        ['context_menu_attempt', 'Right-click context menu blocked', 'LOW', '−1 pt', 'Renderer DOM Handler'],
        ['clipboard_paste', 'External clipboard paste detected', 'LOW', '−2 pts', 'Renderer Event Handler'],
        ['camera_error', 'Webcam became unavailable', 'HIGH', '−10 pts', 'AI Vision Engine'],
        ['dependency_error', 'Python/OpenCV not available', 'HIGH', 'N/A', 'AI Engine Startup'],
    ]
    elements.append(styled_table(det_headers, det_rows, col_widths=[95, 140, 55, 50, 135]))

    elements.append(Spacer(1, 10))
    elements.append(Paragraph('5.1 Trust Score Penalty Algorithm', styles['H2']))
    elements.append(Paragraph(
        'The penalty function in <font face="Courier" color="#2B6CB0">server.js</font> applies a graduated '
        'deduction model:',
        styles['Body']))
    elements.append(Paragraph(
        '<font face="Courier" size="9" color="#2B6CB0">'
        'penalty = severity === "high" ? 10 : severity === "medium" ? 5 : 1;<br/>'
        'trustScore = Math.max(0, interview.trustScore - penalty);</font>',
        styles['Mono']))
    elements.append(Paragraph(
        'Scores are clamped to a minimum of 0 and broadcast via the '
        '<font face="Courier">score_update</font> Socket.IO event to all connected clients.',
        styles['Body']))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('Figure 4: Sample Trust Score Decay', styles['Caption']))
    elements.append(create_trust_score_chart())

    elements.append(PageBreak())
    return elements


def build_file_architecture():
    """Section 6: Comprehensive File-by-File Architecture."""
    elements = []
    elements.append(Paragraph('6. Comprehensive File-by-File Architecture', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    # Directory tree
    elements.append(Paragraph('6.1 Repository Directory Tree', styles['H2']))
    tree = """ai-proctoring-system/
├── backend/
│   ├── models.js
│   ├── mongoStart.js
│   ├── server.js
│   └── package.json
├── electron-client/
│   ├── ai-engine/
│   │   ├── proctor.py
│   │   └── requirements.txt
│   ├── main.js
│   ├── preload.js
│   ├── src/
│   │   ├── index.html
│   │   ├── renderer.js
│   │   └── style.css
│   └── package.json
├── interviewer-dashboard/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AlertsPanel.jsx
│   │   │   ├── DatabaseViewer.jsx
│   │   │   ├── LiveStream.jsx
│   │   │   └── ReportView.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── vite.config.js
│   └── package.json
├── start-all.ps1
├── stop.ps1
├── START ProctorAI.bat
├── STOP ProctorAI.bat
└── README.md"""

    for line in tree.split('\n'):
        elements.append(Paragraph(line, styles['Mono']))

    elements.append(Spacer(1, 10))

    # ─── Backend files ─────────────────────────────────────────────────────
    elements.append(Paragraph('6.2 Backend Layer (Node.js + Express)', styles['H2']))

    backend_headers = ['File', 'Responsibility', 'Key Exports / Functions']
    backend_rows = [
        ['server.js\n(1239 lines)',
         'Primary application entry point. Configures Express with CORS & JSON parsing. '
         'Defines all REST API routes (auth, candidates, interviews, questions, reports, analytics, '
         'code execution, AI evaluation). Sets up three Socket.IO namespaces (/signaling, /proctor, /chat). '
         'Implements the trust score penalty engine and anomaly logging pipeline. Hosts the Gemini '
         'multimodal frame analysis endpoint for server-side AI proctoring.',
         'POST /api/login\nPOST /api/candidates\nGET /api/interviews/active\nPOST /api/run-code\n'
         'POST /api/ai/evaluate\nPOST /api/proctor/analyze-frame\nio.of("/proctor").on("anomaly_alert")'],
        ['models.js\n(123 lines)',
         'Defines five Mongoose schemas: User (candidate/interviewer/admin roles with profile fields), '
         'Question (coding/MCQ/system design with test cases & options), Interview (full session lifecycle '
         'including trust score, AI evaluation, code submissions), Log (timestamped anomaly events with '
         'severity & confidence), and Chat (real-time interview messages).',
         'User, Question, Interview, Log, Chat\n(Mongoose models)'],
        ['mongoStart.js\n(107 lines)',
         'Three-tier MongoDB connection strategy: (1) Use MONGO_URI from .env for Atlas/remote, '
         '(2) Fall back to local MongoDB at 127.0.0.1:27017, (3) Auto-provision an in-memory '
         'mongodb-memory-server instance. Configures custom DNS resolvers (8.8.8.8, 1.1.1.1) to fix '
         'SRV lookup failures on Windows. Never crashes the server — always resolves with a working URI.',
         'startMongoDB() → Promise<string>'],
        ['package.json',
         'Declares Node.js dependencies: express, socket.io, mongoose, mongodb-memory-server, cors, dotenv. '
         'Defines the "start" script for launching the backend server.',
         'npm start → node server.js'],
    ]
    elements.append(styled_table(backend_headers, backend_rows, col_widths=[80, 220, 175]))

    elements.append(Spacer(1, 10))

    # ─── Electron files ────────────────────────────────────────────────────
    elements.append(Paragraph('6.3 Electron Client Layer (Desktop Application)', styles['H2']))

    electron_headers = ['File', 'Responsibility', 'Key Functions / IPC Channels']
    electron_rows = [
        ['main.js\n(468 lines)',
         'Electron main process. Creates the BrowserWindow with fullscreen kiosk configuration. '
         'Registers the "proctorai://" custom protocol for deep-linking. Implements aggressive exam '
         'lockdown: blocks Alt+Tab, Alt+F4, Ctrl+W, F12, clipboard shortcuts via globalShortcut. '
         'Spawns the Python AI engine as a child process and bridges IPC stdout events to the renderer. '
         'Manages single-instance locking and graceful shutdown.',
         'createWindow()\nregisterExamShortcuts()\ntrySpawnPython()\nstartMockAiEngine()\n'
         'IPC: start-ai-engine\nIPC: end-interview\nIPC: get-session-args'],
        ['preload.js\n(9 lines)',
         'Secure context bridge between Electron main and renderer processes. Exposes a sanitized '
         'electronAPI object with only four permitted IPC methods, enforcing context isolation.',
         'electronAPI.startAiEngine(opts)\nelectronAPI.onAiLog(callback)\nelectronAPI.endInterview()\n'
         'electronAPI.getSessionArgs()'],
        ['src/renderer.js\n(849 lines)',
         'Candidate-facing exam logic. Manages the full exam lifecycle: Login → System Check → '
         'Locked Kiosk Exam → Submission. Implements WebRTC via Simple-Peer for live video streaming. '
         'Handles question rendering (coding/MCQ/text), code execution via API, AI proctoring event '
         'processing, focus/tab-switch detection, and keyboard lockdown at the DOM level.',
         'doLogin()\nrunSystemChecks()\nbeginExam()\ninitWebRTC()\nblockKeyboard()\n'
         'handleProctoringEvent()\nrunCode()\nsubmitExam()'],
        ['src/index.html\n(14 KB)',
         'Self-contained candidate exam interface with four screens: login, system check, '
         'exam workspace (code editor, question viewer, camera thumbnail), and submission confirmation. '
         'Loads Simple-Peer and Socket.IO client libraries from CDN.',
         'Screens: login, syscheck, exam, submitted'],
        ['src/style.css\n(24 KB)',
         'Comprehensive dark-theme CSS with animated gradients, glassmorphism effects, responsive '
         'grid layouts for the exam workspace, and styled components for question navigation, '
         'camera overlays, and alert banners.',
         'Dark theme: #050d1a base\nGlassmorphism panels\nCSS animations'],
        ['ai-engine/proctor.py\n(113 lines)',
         'Python AI vision engine. Runs two modes: Real (OpenCV + MediaPipe) and Mock (synthetic events). '
         'In real mode: captures webcam via cv2.VideoCapture(0), runs Face Detection for counting, '
         'Face Mesh for landmark extraction, and computes gaze deflection ratio. Emits JSON events '
         'via stdout. Processes every 5th frame for CPU efficiency.',
         'emit_event(event, severity, confidence)\nrun_real_mode()\nrun_mock_mode()\n'
         'Args: --mock'],
        ['ai-engine/requirements.txt',
         'Python package dependencies for the AI vision engine.',
         'opencv-python\nmediapipe'],
    ]
    elements.append(styled_table(electron_headers, electron_rows, col_widths=[85, 210, 180]))

    elements.append(PageBreak())

    # ─── Dashboard files ───────────────────────────────────────────────────
    elements.append(Paragraph('6.4 Interviewer Dashboard Layer (React + Vite)', styles['H2']))

    dash_headers = ['File', 'Responsibility', 'Key Components / Props']
    dash_rows = [
        ['App.jsx\n(139 KB)',
         'Master dashboard controller. Manages global state, routing (tab navigation), and real-time '
         'WebSocket connections. Implements candidate management (CRUD), interview scheduling, live '
         'monitoring, AI evaluation triggers, question bank management, and comprehensive report '
         'generation. Handles WebRTC signaling for live video from the candidate.',
         'State: candidates, activeInterview, trustScore, alerts\n'
         'Tabs: Monitor, Alerts, Reports, Database, Questions'],
        ['components/AlertsPanel.jsx\n(233 lines)',
         'Real-time incident log panel. Connects to Socket.IO /proctor namespace and listens for '
         'proctor_alert events. Aggregates consecutive identical events with counters. Displays '
         'severity badges (CRITICAL/WARNING/INFO), confidence metrics, and status indicators. '
         'Computes session statistics (total violations, high/medium counts).',
         'Props: roomId\nSocket.IO: /proctor namespace\nALERT_META, SEVERITY_STYLE maps'],
        ['components/LiveStream.jsx\n(14 KB)',
         'WebRTC-based live video player. Establishes a Simple-Peer connection to the candidate\'s '
         'Electron client via the /signaling namespace. Displays the remote video stream with '
         'connection status indicators and fallback placeholder.',
         'Props: roomId, interviewId\nSimple-Peer integration\nWebRTC ICE/STUN'],
        ['components/DatabaseViewer.jsx\n(19 KB)',
         'Administrative database inspection panel. Fetches all users, interviews, logs, and questions '
         'from the /api/admin/db endpoint. Renders tabbed views with sortable, filterable tables. '
         'Supports inline editing of candidate profiles and interview records.',
         'Tabs: Users, Interviews, Logs, Questions\nFetch: /api/admin/db'],
        ['components/ReportView.jsx\n(33 KB)',
         'Comprehensive candidate evaluation report generator. Displays trust score analytics, anomaly '
         'breakdowns, AI evaluation results (per-question scores for correctness, efficiency, code quality), '
         'interviewer notes, ratings, and final decision (Hire/Reject/Hold). Supports PDF-style '
         'formatted output for archival.',
         'Props: report, interviewId\nAI Evaluation display\nDecision workflow'],
        ['main.jsx\n(403 bytes)',
         'React application entry point. Renders the App component into the root DOM element with '
         'StrictMode enabled.',
         'ReactDOM.createRoot()\n<App /> mount'],
        ['index.css\n(34 KB)',
         'Global stylesheet with Tailwind CSS directives and extensive custom dark theme overrides. '
         'Implements glassmorphism panels, animated gradients, and responsive breakpoints for the '
         'dashboard layout.',
         'Tailwind base/components/utilities\nCustom dark theme'],
        ['vite.config.js',
         'Vite build configuration with React plugin and proxy setup for API requests to the backend.',
         '@vitejs/plugin-react\nProxy: /api → localhost:5000'],
    ]
    elements.append(styled_table(dash_headers, dash_rows, col_widths=[100, 200, 175]))

    elements.append(Spacer(1, 10))

    # ─── DevOps files ──────────────────────────────────────────────────────
    elements.append(Paragraph('6.5 DevOps & Automation Scripts', styles['H2']))

    devops_headers = ['File', 'Purpose', 'Key Actions']
    devops_rows = [
        ['start-all.ps1\n(8.6 KB)',
         'Unified PowerShell launch orchestrator. Clears stale processes on ports 5000/5173, '
         'verifies Node.js/Python environments, auto-installs missing npm/pip dependencies, and '
         'sequentially starts the backend, dashboard, and Electron client.',
         'Port cleanup → Dep check → Backend → Dashboard → Electron'],
        ['stop.ps1\n(3.6 KB)',
         'Graceful teardown script. Terminates all Node.js, Electron, and Python processes associated '
         'with the ProctorAI system.',
         'Process kill by port and name'],
        ['START ProctorAI.bat',
         'One-click Windows batch launcher that invokes start-all.ps1.',
         'Double-click to launch entire system'],
        ['STOP ProctorAI.bat',
         'One-click Windows batch stopper that invokes stop.ps1.',
         'Double-click to stop all services'],
        ['sync.ps1',
         'Git auto-commit and push utility. Takes a commit message as argument and pushes to origin.',
         '.\\sync.ps1 "commit message"'],
    ]
    elements.append(styled_table(devops_headers, devops_rows, col_widths=[95, 210, 170]))

    elements.append(PageBreak())
    return elements


def build_webrtc():
    """Section 7: WebRTC."""
    elements = []
    elements.append(Paragraph('7. WebRTC Real-Time Video & Signaling', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'ProctorAI implements peer-to-peer video streaming using <b>WebRTC</b> with the '
        '<b>Simple-Peer</b> library for simplified offer/answer exchange. The signaling layer uses '
        'a dedicated Socket.IO namespace (<font face="Courier" color="#2B6CB0">/signaling</font>) '
        'to coordinate WebRTC session establishment.',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('7.1 Signaling Protocol', styles['H2']))
    signal_headers = ['Event', 'Direction', 'Payload', 'Purpose']
    signal_rows = [
        ['join_room', 'Client → Server', 'roomId (Interview ID)', 'Join the signaling room'],
        ['peer_present', 'Server → Client', '—', 'Notify that a peer is already in the room'],
        ['user_joined', 'Server → Room', 'socket.id', 'Broadcast new peer arrival'],
        ['offer', 'Client → Room', '{roomId, signal}', 'SDP offer for WebRTC connection'],
        ['answer', 'Client → Room', '{roomId, signal}', 'SDP answer accepting the connection'],
        ['ice_candidate', 'Client → Room', '{roomId, candidate}', 'ICE candidate exchange'],
    ]
    elements.append(styled_table(signal_headers, signal_rows, col_widths=[80, 85, 130, 180]))

    elements.append(Spacer(1, 8))
    elements.append(Paragraph('7.2 Connection Strategy', styles['H2']))
    elements.append(Paragraph(
        'The candidate Electron client always acts as the <b>initiator</b> for the WebRTC connection. '
        'This deliberate design choice prevents offer/answer race conditions when both parties join '
        'the room simultaneously. The Simple-Peer library is configured with '
        '<font face="Courier">trickle: false</font> to batch all ICE candidates into a single signal, '
        'simplifying the exchange at the cost of slightly higher initial connection latency (~1-2s).',
        styles['Body']))

    elements.append(PageBreak())
    return elements


def build_security():
    """Section 8: Security & Kiosk Lockdown."""
    elements = []
    elements.append(Paragraph('8. Security & Kiosk Lockdown Model', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'ProctorAI implements a <b>defense-in-depth</b> security model with multiple overlapping '
        'lockdown layers operating at both the OS level (Electron main process) and the DOM level '
        '(renderer process).',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('8.1 Electron Main Process Lockdown', styles['H2']))

    sec_headers = ['Mechanism', 'Implementation', 'Blocked Actions']
    sec_rows = [
        ['Kiosk Mode', 'mainWindow.setKiosk(true)\nmainWindow.setAlwaysOnTop(true, "screen-saver")',
         'Taskbar hidden, window always on top, full screen enforced'],
        ['Global Shortcut Blocking', 'globalShortcut.register() for 20+ shortcuts',
         'Alt+F4, Alt+Tab, Ctrl+W, Ctrl+Q, Ctrl+R, F5, F11, F12, Ctrl+Shift+I, Escape'],
        ['Window Property Lockdown', 'setResizable(false), setMovable(false), setClosable(false)',
         'Resize, move, minimize, maximize, close — all disabled during exam'],
        ['Blur Recovery', 'setInterval focus steal on window blur event',
         'Alt+Tab recovery: re-focuses window every 50ms until regained'],
        ['Navigation Block', 'will-navigate event handler',
         'Prevents loading any URL outside the exam domain during active session'],
        ['DevTools Prevention', 'devtools-opened listener + closeDevTools()',
         'Automatically closes DevTools if opened during exam'],
    ]
    elements.append(styled_table(sec_headers, sec_rows, col_widths=[95, 200, 180]))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('8.2 Renderer-Level DOM Lockdown', styles['H2']))
    dom_sec = [
        '<b>Keyboard Event Interception:</b> A capture-phase keydown listener blocks Alt, Meta, Escape, F-keys, '
        'and Ctrl+C/V/X (unless the user is typing in a code editor input).',
        '<b>Context Menu Suppression:</b> Right-click is intercepted via the contextmenu event and logged.',
        '<b>Drag Prevention:</b> dragstart events are cancelled to prevent drag-and-drop attacks.',
        '<b>Clipboard Monitoring:</b> Paste events outside designated input areas are intercepted and flagged.',
    ]
    for item in dom_sec:
        elements.append(bullet(item))

    elements.append(Spacer(1, 6))
    elements.append(CalloutBox(
        'All blocked shortcut attempts are logged as anomaly events with appropriate severity levels and '
        'broadcast to the interviewer dashboard in real-time. This creates a comprehensive audit trail '
        'of all evasion attempts.',
        kind='warning'))

    elements.append(PageBreak())
    return elements


def build_edge_cases():
    """Section 9: Edge Cases & Anti-Spoofing."""
    elements = []
    elements.append(Paragraph('9. Edge Cases & Anti-Spoofing Strategies', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph('9.1 Handling Adverse Conditions', styles['H2']))
    edge_cases = [
        '<b>Low Light / Poor Camera:</b> MediaPipe\'s face detection threshold (0.5 confidence) filters out '
        'ghost detections. In extremely low light, the system may emit no_face events; interviewers can '
        'view the live stream to verify conditions.',
        '<b>Partial Occlusions:</b> MediaPipe Face Mesh is robust to moderate occlusions (glasses, partial '
        'hand coverage). The gaze ratio algorithm uses stable landmarks (nose tip, face boundaries) that '
        'remain detectable even under partial obstruction.',
        '<b>Network Drops:</b> Socket.IO\'s built-in reconnection mechanism automatically re-establishes '
        'the WebSocket connection after network interruptions. Missed events during downtime are not '
        'replayed, but the trust score state is authoritative on the server.',
        '<b>Python Unavailable:</b> If Python or OpenCV/MediaPipe are not installed, the Electron main '
        'process automatically falls back to a JavaScript-based mock engine that generates synthetic '
        'events for testing purposes.',
    ]
    for ec in edge_cases:
        elements.append(bullet(ec))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('9.2 False Positive Mitigation', styles['H2']))
    fp_strategies = [
        '<b>Frame Throttling (5-frame intervals):</b> Only every 5th frame is analyzed, which naturally '
        'smooths out transient mis-detections caused by motion blur or rapid head movements.',
        '<b>Gaze Ratio Thresholds (0.3 / 0.7):</b> The gaze deflection threshold is set conservatively to '
        'allow normal reading eye movements while flagging only significant lateral head rotations.',
        '<b>Confidence Scoring:</b> Each event includes a confidence value (0.0–1.0) that the dashboard '
        'can use to filter low-confidence alerts for manual review.',
        '<b>Consecutive Event Aggregation:</b> The AlertsPanel component merges consecutive identical events '
        'into a single entry with a count badge, reducing alert fatigue for interviewers.',
    ]
    for fp in fp_strategies:
        elements.append(bullet(fp))

    elements.append(Spacer(1, 6))
    elements.append(Paragraph('9.3 Privacy & Ethical Practices', styles['H2']))
    privacy = [
        '<b>Client-Side Processing:</b> All video analysis is performed locally on the candidate\'s machine. '
        'No raw video frames are transmitted to or stored on the server.',
        '<b>Minimal Data Transmission:</b> Only lightweight JSON event payloads (event type, severity, '
        'confidence, timestamp) are sent over the network.',
        '<b>No Biometric Storage:</b> Face embeddings and landmark data are processed ephemerally in-memory '
        'and discarded after each frame.',
        '<b>Transparent Logging:</b> Candidates can see the trust score and alert indicators in their exam '
        'interface, promoting transparency in the proctoring process.',
    ]
    for p in privacy:
        elements.append(bullet(p))

    elements.append(PageBreak())
    return elements


def build_database():
    """Section 10: Database Schema."""
    elements = []
    elements.append(Paragraph('10. Database Schema & Data Model', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'ProctorAI uses MongoDB with Mongoose ODM for data persistence. The database contains five '
        'primary collections, each mapped to a Mongoose schema defined in '
        '<font face="Courier" color="#2B6CB0">models.js</font>.',
        styles['Body']))

    elements.append(Spacer(1, 4))

    # User Schema
    elements.append(Paragraph('10.1 User Schema', styles['H2']))
    user_headers = ['Field', 'Type', 'Constraints', 'Description']
    user_rows = [
        ['username', 'String', 'required, unique, trim', 'Login identifier'],
        ['password', 'String', 'required', 'Plain-text password (demo)'],
        ['role', 'String', 'enum: candidate|interviewer|admin', 'User role classification'],
        ['fullname', 'String', 'default: ""', 'Display name'],
        ['email', 'String', 'default: ""', 'Contact email'],
        ['company', 'String', 'default: ""', 'Organization (interviewers)'],
        ['jobTitle', 'String', 'default: ""', 'Position title'],
        ['tags', '[String]', '—', 'Labels: shortlisted, hold, rejected'],
    ]
    elements.append(styled_table(user_headers, user_rows, col_widths=[70, 55, 155, 195]))

    elements.append(Spacer(1, 8))

    # Interview Schema
    elements.append(Paragraph('10.2 Interview Schema', styles['H2']))
    int_headers = ['Field', 'Type', 'Description']
    int_rows = [
        ['candidateId', 'ObjectId → User', 'Reference to the candidate'],
        ['interviewerId', 'ObjectId → User', 'Reference to the assigned interviewer'],
        ['status', 'enum: scheduled|active|completed|cancelled|no_show', 'Session lifecycle state'],
        ['trustScore', 'Number (default: 100)', 'Dynamic integrity score (0–100)'],
        ['questions', '[ObjectId → Question]', 'Assigned question references'],
        ['codeSubmissions', 'String (JSON)', 'Serialized candidate code answers'],
        ['aiEvaluation', 'String (JSON)', 'Gemini AI per-question evaluation'],
        ['aiOverallScore', 'Number', 'AI-computed overall score (0–100)'],
        ['decision', 'enum: pending|hire|reject|hold', 'Final interviewer decision'],
        ['interviewerRating', 'Number', 'Interviewer star rating (1–5)'],
        ['actualDuration', 'Number', 'Real session duration in seconds'],
    ]
    elements.append(styled_table(int_headers, int_rows, col_widths=[95, 130, 250]))

    elements.append(Spacer(1, 8))

    # Log Schema
    elements.append(Paragraph('10.3 Log (Anomaly) Schema', styles['H2']))
    log_headers = ['Field', 'Type', 'Description']
    log_rows = [
        ['interviewId', 'ObjectId → Interview', 'Associated interview session'],
        ['timestamp', 'Date (auto)', 'Event timestamp'],
        ['anomalyType', 'String (required)', 'Event code (e.g., no_face, multiple_faces)'],
        ['severity', 'enum: low|medium|high', 'Severity classification'],
        ['confidence', 'Number (default: 1.0)', 'Detection confidence (0.0–1.0)'],
        ['details', 'String', 'Human-readable event description'],
    ]
    elements.append(styled_table(log_headers, log_rows, col_widths=[95, 130, 250]))

    elements.append(PageBreak())
    return elements


def build_ai_evaluation():
    """Section 11: AI-Powered Evaluation."""
    elements = []
    elements.append(Paragraph('11. AI-Powered Evaluation (Gemini Integration)', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph(
        'ProctorAI integrates Google\'s <b>Gemini 2.5 Flash</b> API for three AI-powered capabilities:',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('11.1 Code Evaluation', styles['H2']))
    elements.append(Paragraph(
        'The <font face="Courier" color="#2B6CB0">POST /api/ai/evaluate</font> endpoint sends candidate '
        'code submissions to Gemini with a structured prompt requesting JSON-formatted evaluation scores '
        'for correctness (0–10), efficiency (0–10), and code quality (0–10) per question, plus an overall '
        'score (0–100), technical level assessment, and hire/consider/reject recommendation.',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('11.2 Question Generation', styles['H2']))
    elements.append(Paragraph(
        'The <font face="Courier" color="#2B6CB0">POST /api/ai/generate-questions</font> endpoint generates '
        'tailored technical interview questions based on job role, level, and focus topics. Questions are '
        'returned with title, description, type, difficulty, starter code, and tags.',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(Paragraph('11.3 Multimodal Frame Analysis', styles['H2']))
    elements.append(Paragraph(
        'The <font face="Courier" color="#2B6CB0">POST /api/proctor/analyze-frame</font> endpoint accepts '
        'a base64-encoded webcam frame and sends it to Gemini with a vision prompt that counts faces, '
        'detects gaze direction, and identifies suspicious objects (phones, notes, earbuds). This provides '
        'a server-side AI proctoring layer complementing the client-side MediaPipe engine.',
        styles['Body']))

    elements.append(Spacer(1, 4))
    elements.append(CalloutBox(
        'All Gemini API calls are guarded by configuredSecret() checks. If no GEMINI_API_KEY is set in '
        '.env, the system gracefully degrades: code evaluation returns a placeholder, and server-side '
        'frame analysis is skipped (client-side detection continues independently).',
        kind='info'))

    elements.append(PageBreak())
    return elements


def build_deployment():
    """Section 12: Setup & Deployment."""
    elements = []
    elements.append(Paragraph('12. Setup, Deployment & Quick Start', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph('12.1 Prerequisites', styles['H2']))
    prereq_headers = ['Requirement', 'Version', 'Purpose']
    prereq_rows = [
        ['Node.js', 'v18+', 'Backend server and Electron runtime'],
        ['Python', '3.9+', 'AI vision engine (optional — mock fallback available)'],
        ['Git', 'Any', 'Version control and repository cloning'],
        ['MongoDB', 'Optional', 'Persistent storage (auto-detects or uses in-memory)'],
    ]
    elements.append(styled_table(prereq_headers, prereq_rows, col_widths=[120, 80, 275]))

    elements.append(Spacer(1, 8))
    elements.append(Paragraph('12.2 One-Click Launch (Windows)', styles['H2']))
    elements.append(Paragraph(
        'Double-click <font face="Courier" color="#2B6CB0">START ProctorAI.bat</font> or run '
        '<font face="Courier" color="#2B6CB0">.\\start-all.ps1</font> in PowerShell. The orchestration '
        'script automatically:',
        styles['Body']))
    launch_steps = [
        'Clears stale processes on ports 5000 and 5173.',
        'Verifies Node.js and Python environments.',
        'Auto-installs missing npm and pip dependencies.',
        'Starts the Backend Server (http://localhost:5000).',
        'Launches the Interviewer Dashboard (http://localhost:5173).',
        'Opens the Electron Candidate Application.',
    ]
    for i, step in enumerate(launch_steps, 1):
        elements.append(bullet(f'<b>Step {i}:</b> {step}'))

    elements.append(Spacer(1, 8))
    elements.append(Paragraph('12.3 Environment Configuration', styles['H2']))
    env_headers = ['Variable', 'Default', 'Description']
    env_rows = [
        ['PORT', '5000', 'Backend server port'],
        ['MONGO_URI', '(empty)', 'MongoDB connection URI (Atlas or local). Empty = in-memory.'],
        ['JWT_SECRET', '—', 'Secret key for JWT token signing'],
        ['JUDGE0_API_KEY', '—', 'RapidAPI key for Judge0 code execution sandbox'],
        ['GEMINI_API_KEY', '—', 'Google Gemini API key for AI evaluation and vision'],
    ]
    elements.append(styled_table(env_headers, env_rows, col_widths=[100, 80, 295]))

    elements.append(PageBreak())
    return elements


def build_scalability():
    """Section 13: Scalability & Future Improvements."""
    elements = []
    elements.append(Paragraph('13. Scalability & Future Improvements', styles['H1']))
    elements.append(SectionDivider())
    elements.append(Spacer(1, 8))

    elements.append(Paragraph('13.1 Current Architecture Constraints', styles['H2']))
    constraints = [
        '<b>Single-Server Backend:</b> The Express server runs on a single Node.js process. Under '
        'heavy load (100+ concurrent sessions), CPU-bound tasks like anomaly logging may cause event '
        'loop blocking. Mitigation: horizontal scaling with PM2 cluster mode or container orchestration.',
        '<b>Client-Side AI Processing:</b> Running MediaPipe on the candidate\'s machine ensures privacy '
        'but limits detection capabilities to the client\'s hardware. Low-end machines may experience '
        'frame drops or delayed inference.',
        '<b>In-Memory Database Volatility:</b> The mongodb-memory-server fallback loses all data on '
        'restart. This is acceptable for development but requires Atlas or local MongoDB for production.',
        '<b>WebRTC Scalability:</b> Peer-to-peer connections work well for 1:1 sessions. Supporting '
        'multiple concurrent viewers would require an SFU (Selective Forwarding Unit) media server.',
    ]
    for c in constraints:
        elements.append(bullet(c))

    elements.append(Spacer(1, 8))
    elements.append(Paragraph('13.2 Roadmap & Planned Enhancements', styles['H2']))

    roadmap_headers = ['Enhancement', 'Priority', 'Impact', 'Complexity']
    roadmap_rows = [
        ['Object Detection (YOLOv8)', 'HIGH', 'Detect phones, books, earbuds', 'Medium'],
        ['Audio Anomaly Detection', 'HIGH', 'Detect secondary voices, whispers', 'High'],
        ['Temporal Smoothing (N-frame)', 'MEDIUM', 'Reduce false positives by 60%+', 'Low'],
        ['JWT Authentication', 'HIGH', 'Secure API routes with token auth', 'Low'],
        ['Password Hashing (bcrypt)', 'HIGH', 'Secure credential storage', 'Low'],
        ['SFU Media Server', 'MEDIUM', 'Multi-viewer live streaming', 'High'],
        ['Docker Containerization', 'MEDIUM', 'Reproducible deployment', 'Medium'],
        ['Screen Recording Capture', 'LOW', 'Post-session video review', 'Medium'],
        ['Browser Extension Client', 'LOW', 'Cross-platform web-only mode', 'High'],
        ['Anti-Spoofing (Liveness)', 'MEDIUM', 'Detect photo/video playback attacks', 'High'],
    ]
    elements.append(styled_table(roadmap_headers, roadmap_rows, col_widths=[145, 65, 170, 95]))

    elements.append(Spacer(1, 12))
    elements.append(CalloutBox(
        'ProctorAI is designed as a modular, extensible platform. Each detection capability '
        '(face, gaze, audio, object) can be independently upgraded or swapped without affecting '
        'the rest of the system, thanks to the JSON event interface between the AI engine and '
        'the application layer.',
        kind='success'))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width='60%', thickness=1, color=C_ACCENT,
                               spaceAfter=12, hAlign='CENTER'))
    elements.append(Paragraph(
        '<font color="#1A365D"><b>— End of Technical Report —</b></font>',
        ParagraphStyle('EndMark', fontName='Helvetica-Bold', fontSize=12,
                       alignment=TA_CENTER, textColor=C_NAVY, spaceAfter=8)))
    elements.append(Paragraph(
        'ProctorAI Enterprise v2.0.0 • Sayeem Raza • MIT License',
        ParagraphStyle('EndSub', fontName='Helvetica', fontSize=9,
                       alignment=TA_CENTER, textColor=C_GREY)))

    return elements


# ═════════════════════════════════════════════════════════════════════════════
#  MAIN: Assemble & Build PDF
# ═════════════════════════════════════════════════════════════════════════════

def main():
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               'ProctorAI_Technical_Report.pdf')

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=50,
        bottomMargin=50,
        title='ProctorAI Enterprise — Technical Architecture Report',
        author='Sayeem Raza',
        subject='AI-Based Automated Online Proctoring System',
        creator='ProctorAI Report Generator v2.0'
    )

    print('🔨 Building ProctorAI Technical Report...')
    print('   Generating cover page...')
    elements = build_cover_page()
    print('   Generating table of contents...')
    elements += build_toc()
    print('   Section 1: Executive Summary...')
    elements += build_executive_summary()
    print('   Section 2: System Architecture (with diagram)...')
    elements += build_architecture()
    print('   Section 3: Technology Stack (with chart)...')
    elements += build_tech_stack()
    print('   Section 4: AI Vision Pipeline (with flowchart)...')
    elements += build_vision_pipeline()
    print('   Section 5: Detection Matrix (with trust score chart)...')
    elements += build_detection_matrix()
    print('   Section 6: File-by-File Architecture...')
    elements += build_file_architecture()
    print('   Section 7: WebRTC Signaling...')
    elements += build_webrtc()
    print('   Section 8: Security & Kiosk Lockdown...')
    elements += build_security()
    print('   Section 9: Edge Cases & Anti-Spoofing...')
    elements += build_edge_cases()
    print('   Section 10: Database Schema...')
    elements += build_database()
    print('   Section 11: AI Evaluation (Gemini)...')
    elements += build_ai_evaluation()
    print('   Section 12: Setup & Deployment...')
    elements += build_deployment()
    print('   Section 13: Scalability & Future...')
    elements += build_scalability()

    print(f'\n📄 Compiling PDF ({len(elements)} flowable elements)...')
    doc.build(elements, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f'\n✅ Report generated successfully!')
    print(f'   📁 Output: {output_path}')
    print(f'   📊 Pages: ~25+')
    file_size = os.path.getsize(output_path)
    print(f'   💾 Size: {file_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
