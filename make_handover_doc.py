# make_handover_doc.py
# Generates a concise, clean, developer-focused Handover Document for Ali and Fraser
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=60, bottom=60, left=100, right=100):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def set_table_borders(table, color="D0D5DD", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="none"/>
            <w:right w:val="none"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="none"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def format_cell(cell, text, bold=False, italic=False, color=None, font_size=8.5, align=WD_ALIGN_PARAGRAPH.LEFT, bg=None):
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = "Arial"
    run.font.size = Pt(font_size)
    if color:
        run.font.color.rgb = color
    if bg:
        set_cell_background(cell, bg)
    set_cell_margins(cell, top=50, bottom=50, left=80, right=80)

def add_callout(doc, text, title="NOTE"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.rows[0].cells[0]
    cell.width = Inches(6.8)
    set_cell_background(cell, "EFF8FF")
    set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:bottom w:val="none"/>
            <w:left w:val="single" w:sz="18" w:space="0" w:color="00338D"/>
            <w:right w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    r1 = p.add_run(f"[{title}] ")
    r1.bold = True
    r1.font.name = "Arial"
    r1.font.size = Pt(9)
    r1.font.color.rgb = RGBColor(0, 51, 141)
    
    r2 = p.add_run(text)
    r2.font.name = "Arial"
    r2.font.size = Pt(8.5)
    r2.font.color.rgb = RGBColor(52, 64, 84)

def main():
    doc = Document()
    
    for s in doc.sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)
        
    NAVY = RGBColor(0, 51, 141)        # #00338D
    SLATE = RGBColor(71, 84, 103)      # #475467
    DARK_BLUE = RGBColor(16, 24, 40)   # #101828
    GREEN = RGBColor(2, 122, 72)       # #027A48
    WHITE = RGBColor(255, 255, 255)

    # ── TITLE / HEADER ─────────────────────────────────────────────────────────────
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run_meta = p_meta.add_run("DEVELOPER HANDOVER · API STATUS & BACKEND CONTRACTS")
    run_meta.font.name = "Arial"
    run_meta.font.size = Pt(8)
    run_meta.font.bold = True
    run_meta.font.color.rgb = RGBColor(102, 112, 133)
    
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(6)
    p_title.paragraph_format.space_after = Pt(2)
    run_title = p_title.add_run("OT-Synapse — Frontend Handover to Ali & Fraser")
    run_title.font.name = "Arial"
    run_title.font.size = Pt(18)
    run_title.font.bold = True
    run_title.font.color.rgb = NAVY
    
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(8)
    run_sub = p_sub.add_run("Technical summary: active APIs, auth/CSRF, offline resilience, and required backend routes.")
    run_sub.font.name = "Arial"
    run_sub.font.size = Pt(10)
    run_sub.font.color.rgb = SLATE

    add_callout(doc,
        "Frontend wiring and UI journeys are completed across all pages. "
        "This brief summarizes integrated endpoints, offline fallbacks, and required backend routes for Ali.",
        title="DEVELOPER BRIEF")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # ── 1. AUTHENTICATION & CSRF (VERY SHORT & CONCISE) ────────────────────────────
    h1 = doc.add_heading(level=1)
    r_h1 = h1.add_run("1. Authentication & CSRF Security")
    r_h1.font.name = "Arial"
    r_h1.font.color.rgb = NAVY

    p_auth = doc.add_paragraph()
    p_auth.paragraph_format.space_before = Pt(2)
    p_auth.paragraph_format.space_after = Pt(4)
    p_auth.add_run("• Microsoft Entra ID (Azure AD): ").bold = True
    p_auth.add_run("OAuth 2.0 PKCE flow via MSAL; tokens passed as 'Authorization: Bearer <token>' on all API calls.\n")
    p_auth.add_run("• CSRF Protection: ").bold = True
    p_auth.add_run("Double Submit Cookie pattern. Client receives 'csrftoken' via /health and sends lowercase 'x-csrftoken' header on mutating requests (POST, PUT, PATCH, DELETE).\n")
    p_auth.add_run("• Session Persistence: ").bold = True
    p_auth.add_run("Local session state preserved across reloads for seamless consultant workflow.")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # ── 2. PAGE-BY-PAGE API INTEGRATION (COMPACT & SHORT) ─────────────────────────
    h2 = doc.add_heading(level=1)
    r_h2 = h2.add_run("2. Active Endpoints & Page-by-Page Integration")
    r_h2.font.name = "Arial"
    r_h2.font.color.rgb = NAVY

    page_table = doc.add_table(rows=9, cols=3)
    page_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    page_table.autofit = False
    set_table_borders(page_table, "D0D5DD")

    p_widths = [Inches(1.5), Inches(2.6), Inches(2.7)]
    p_headers = ["Screen / Page", "Active Backend Endpoints", "Frontend Handling"]
    for c_idx, h_text in enumerate(p_headers):
        cell = page_table.rows[0].cells[c_idx]
        cell.width = p_widths[c_idx]
        format_cell(cell, h_text, bold=True, color=WHITE, font_size=8.5, bg="00338D")

    page_data = [
        ("Dashboard", 
         "GET /api/dashboard/stats\nGET /api/zones/\nGET /api/compliance/status\nGET /api/assets/visibility/",
         "Live KPIs and real-time IEC 62443 Security Level Radar Chart (Target SL-T & Achieved SL-A)."),
        
        ("Model", 
         "GET & POST /api/zones/\nPOST /api/zones/{id}/rules\nGET /api/conduits/\nGET /api/assets/?limit=200",
         "Live Zones, Subnet Rules, and Conduits loaded and modeled interactively."),
        
        ("Assets", 
         "GET /api/assets/?limit=200\nGET /api/assets/visibility/\nPUT /api/assets/{id}/zone/",
         "Live asset inventory, Purdue levels (0-5), and Segmented Visibility meter."),
        
        ("IEC 62443 Compliance", 
         "GET & PUT /api/compliance/status\nGET /api/compliance/fr\nGET /api/compliance/sr",
         "Full FR1-FR7 matrix; updates SR status (met/partial/blocked) with audit timestamps."),
        
        ("Vulnerabilities", 
         "GET & POST /api/vulnerabilities/\nGET /api/vulnerabilities/cves/\nPOST /api/vulnerabilities/cves/enrich",
         "19 live routes for CVEs, CVSS scoring, CISA KEV, EPSS, and consultant overrides."),
        
        ("Risk Landscape", 
         "GET /api/zones/\nGET /api/conduits/\nGET /api/vulnerabilities/",
         "Dynamic visual topology based on live zones, conduits, and vulnerability scores."),
        
        ("Mitigations", 
         "GET /api/vulnerabilities/\nGET /api/compliance/status",
         "Dynamic compensating controls roadmap derived from live vulnerabilities and gaps."),
        
        ("Reports & Logs", 
         "POST /api/report/docx/\nPOST /api/report/zone-model/pdf/\nPOST /api/report/zone-model/docx/",
         "Document generation endpoints wired for executive reports and session audit trail."),
    ]

    for r_idx, (screen, apis, handling) in enumerate(page_data, start=1):
        bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
        row = page_table.rows[r_idx]
        format_cell(row.cells[0], screen, bold=True, color=DARK_BLUE, font_size=8, bg=bg)
        format_cell(row.cells[1], apis, color=GREEN, font_size=7.5, bg=bg)
        format_cell(row.cells[2], handling, color=SLATE, font_size=8, bg=bg)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # ── 3. OFFLINE RESILIENCE ARCHITECTURE ─────────────────────────────────────────
    h3 = doc.add_heading(level=1)
    r_h3 = h3.add_run("3. Offline Resilience & Live Status Badge")
    r_h3.font.name = "Arial"
    r_h3.font.color.rgb = NAVY

    p_res = doc.add_paragraph()
    p_res.paragraph_format.space_before = Pt(2)
    p_res.paragraph_format.space_after = Pt(4)
    p_res.add_run("• Live Header Indicator: ").bold = True
    p_res.add_run("Polls /health every 30 seconds. Displays green pill 'API v1.0.0 (Live)' when backend is active, and neutral pill 'API v1.0.0 (Offline)' when unreachable.\n")
    p_res.add_run("• Zero-Crash Fallbacks: ").bold = True
    p_res.add_run("All background API calls include safe catch handlers. If any endpoint returns 404 or backend is down, frontend seamlessly operates using local assessment store data.")

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # ── 4. BACKEND ACTION ITEMS FOR ALI (CLEAN - NO 100%, NO STATUS PENDING) ──────
    h4 = doc.add_heading(level=1)
    r_h4 = h4.add_run("4. Backend Action Items (For Ali)")
    r_h4.font.name = "Arial"
    r_h4.font.color.rgb = NAVY

    doc.add_paragraph(
        "Frontend wiring is completed for all items below. Required routes to be created in FastAPI backend:"
    ).paragraph_format.space_after = Pt(4)

    action_table = doc.add_table(rows=6, cols=4)
    action_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    action_table.autofit = False
    set_table_borders(action_table, "D0D5DD")

    a_widths = [Inches(1.8), Inches(0.9), Inches(1.1), Inches(3.0)]
    a_headers = ["Endpoint", "Method", "Frontend", "Backend Requirement"]
    for c_idx, h_text in enumerate(a_headers):
        cell = action_table.rows[0].cells[c_idx]
        cell.width = a_widths[c_idx]
        format_cell(cell, h_text, bold=True, color=WHITE, font_size=8.5, bg="00338D")

    action_rows = [
        ("GET & PUT /api/model/scope/", "GET, PUT", "Completed",
         "GET returns scope JSON { name, industry, site, size, tooling, drop_url }. PUT saves scope updates."),
        
        ("GET /api/model/evidence/folder-plan/", "GET", "Completed",
         "Returns { guideline: string, plan: string } or raw text for client upload folder guidelines."),
        
        ("GET /api/model/evidence/groups/", "GET, POST", "Completed",
         "GET returns 6 category cards with item counts. POST /scan/ triggers background evidence scan."),
        
        ("POST /api/assets/shadow/{id}/register/", "POST", "Completed",
         "Body: { zone_id, purdue_level, name }. Promotes shadow asset into official asset inventory."),
        
        ("GET /api/assets/internet-facing-suggestions/", "GET, POST", "Completed",
         "GET returns exposure candidates. POST confirm/dismiss endpoints persist consultant decisions."),
    ]

    for r_idx, (ep, meth, f_st, desc) in enumerate(action_rows, start=1):
        bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
        row = action_table.rows[r_idx]
        format_cell(row.cells[0], ep, bold=True, color=NAVY, font_size=8, bg=bg)
        format_cell(row.cells[1], meth, bold=True, color=DARK_BLUE, font_size=8, bg=bg)
        format_cell(row.cells[2], f_st, bold=True, color=GREEN, font_size=8, bg=bg, align=WD_ALIGN_PARAGRAPH.CENTER)
        format_cell(row.cells[3], desc, color=DARK_BLUE, font_size=8, bg=bg)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # ── SIGN-OFF FOOTER ────────────────────────────────────────────────────────────
    p_end = doc.add_paragraph()
    p_end.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_end = p_end.add_run("All frontend code is committed and pushed to Git repository. Ready for backend deployment alignment with Ali.")
    r_end.font.name = "Arial"
    r_end.font.size = Pt(8)
    r_end.font.italic = True
    r_end.font.color.rgb = SLATE

    output_path = "/Users/vikram/Desktop/Antigravity/OT-synapse/OT_Synapse_Project_Handover_Documentation.docx"
    doc.save(output_path)
    print(f"Concise, clean handover document saved to: {output_path}")

if __name__ == "__main__":
    main()
