% *****************************************************************************
%
%        FASThesis
%        Bachelor's/Master's/Doctoral/Habilitation Thesis,
%        Doctoral Dissertation & Seminar Work
%        Class File/Document Template
%
%        Faculty of Applied Sciences
%        University of West Bohemia
%
%        LaTeX2e Class Definition
%        Copyright (c) 2022-2026 Kamil Ekštein, Dept. of Computer Science
%        and Engineering, Faculty of Applied Sciences, UWB
%
%        Version:  0.999 (Release Candidate 11)
%        Encoding: UTF-8
%        TeXer:    pdflatex
%
%        Last modification on 05-May-2026 by KE
%
% *****************************************************************************

%
%	CONFIGURATION OPTIONS:
%	english - the work is written in English
%	czech - the work is written in Czech
%	sem - seminar work
%	bc - bachelor's thesis (alias 'ba')
%	bpr - bachelor's project
%	mgr - master's thesis (alias 'ma')
%	ing - master's thesis (alias 'ma')
%	rig - doctoral dissertation theses (alias 'ddt')
%	phd - doctoral dissertation
%	hab - habilitation thesis
%	oth - other type of thesis (headers must be defined manually)
%	he - the author is male
%	she - the author is female
%	iso690alph - bibliography is typeset according to ISO 690, labels are alphanumeric shorts
%	iso690auyr - bibliography is typeset according to ISO 690, labels are author-year pairs
%	iso690numb - bibliography is typeset according to ISO 690, labels are numbers
%	ftalph - bibliography is typeset according to FASThesis in-house consuetudinary rules
%	pdf - the document will be stored in PDF (i.e. background graphics on the titlepage included)
%	prn - the document is intended only for printing (i.e. black+white, no background graphics)
%	nobggfx - do not use the background graphics on the front page (no background graphics)
%	viewonly - the document will not be printed, just viewed on screen (==> no blank reverse side pages)
%

% _____________________________________________________________________________
%
%        CLASS FILE PROLOGUE
% _____________________________________________________________________________
%

\makeatletter
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{fasthesis}[2026/05/04 FAS UWB Thesis Class (Version 0.999)]

% _____________________________________________________________________________
%
%        DEFINITIONS OF CONSTANTS
% _____________________________________________________________________________
%

\def\c@czech{czech}
\def\c@english{english}

\def\c@maleauthor{he}
\def\c@femaleauthor{she}

\def\c@semestral{se}
\def\c@bachelors{ba}
\def\c@baproject{bpr}
\def\c@masters{ma}
\def\c@rigorous{ddt}
\def\c@doctoral{phd}
\def\c@habilitation{hab}
\def\c@other{oth}

\def\c@fullcolor{pdf}
\def\c@printonly{prn}
\def\c@oneside{oneside}
\def\c@twoside{twoside}

\def\c@dept@kfy{kfy}
\def\c@dept@kgm{kgm}
\def\c@dept@kiv{kiv}
\def\c@dept@kky{kky}
\def\c@dept@kma{kma}
\def\c@dept@kme{kme}

\def\c@csnisoal{iso-alphabetic}	% "[AB2023]" -- bibliography style according to ČSN ISO 690 by Michal Hoftich, FI MUNI
\def\c@csnisoay{iso-authoryear}	% "(A, B, 2023)" -- bibliography style according to ČSN ISO 690 by Michal Hoftich, FI MUNI
\def\c@csnisonr{iso-numeric}	% "[1]" -- bibliography style according to ČSN ISO 690 by Michal Hoftich, FI MUNI
\def\c@ftalpha{alphabetic}		% in-house FASThesis bibliography style (not conflicting with ČSN ISO 690)

\def\c@yes{yes}
\def\c@no{no}

% _____________________________________________________________________________
%
%        DECLARATIONS OF CLASS OPTIONS
% _____________________________________________________________________________
%

% options for the document language (\FASThesis@lang) 
\DeclareOption{czech}{\let\FASThesis@lang\c@czech}
\DeclareOption{english}{\let\FASThesis@lang\c@english}

% options for the document type (\FASThesis@type) 
\DeclareOption{sem}{\let\FASThesis@type\c@semestral}
\DeclareOption{bc}{\let\FASThesis@type\c@bachelors}
\DeclareOption{ba}{\let\FASThesis@type\c@bachelors}
\DeclareOption{bpr}{\let\FASThesis@type\c@baproject}
\DeclareOption{mgr}{\let\FASThesis@type\c@masters}
\DeclareOption{ing}{\let\FASThesis@type\c@masters}
\DeclareOption{ma}{\let\FASThesis@type\c@masters}
\DeclareOption{rig}{\let\FASThesis@type\c@rigorous}
\DeclareOption{ddt}{\let\FASThesis@type\c@rigorous}
\DeclareOption{phd}{\let\FASThesis@type\c@doctoral}
\DeclareOption{hab}{\let\FASThesis@type\c@habilitation}
\DeclareOption{oth}{\let\FASThesis@type\c@other}

% options for the document gender (\FASThesis@sex) <== affects only the wording of disclaimers
\DeclareOption{he}{\let\FASThesis@sex\c@maleauthor}
\DeclareOption{she}{\let\FASThesis@sex\c@femaleauthor}

% options for the document finalization
\DeclareOption{pdf}{\let\FASThesis@style\c@fullcolor}
\DeclareOption{prn}{\let\FASThesis@style\c@printonly}
\DeclareOption{nobggfx}{\def\FASThesis@nobggfx{}}

\let\FASThesis@print@sides\c@twoside
\DeclareOption{viewonly}{\let\FASThesis@print@sides\c@oneside}

% options for the bibliography/reference style (\FASThesis@bibliography@style)
\DeclareOption{iso690alph}{\let\FASThesis@bibliography@style\c@csnisoal}
\DeclareOption{iso690auyr}{\let\FASThesis@bibliography@style\c@csnisoay}
\DeclareOption{iso690numb}{\let\FASThesis@bibliography@style\c@csnisonr}
\DeclareOption{ftalph}{\let\FASThesis@bibliography@style\c@ftalpha}

% options for the departments (\FASThesis@dept) of the Faculty of Applied Sciences
\DeclareOption{kfy}{\let\FASThesis@dept\c@dept@kfy}
\DeclareOption{kgm}{\let\FASThesis@dept\c@dept@kgm}
\DeclareOption{kiv}{\let\FASThesis@dept\c@dept@kiv}
\DeclareOption{kky}{\let\FASThesis@dept\c@dept@kky}
\DeclareOption{kma}{\let\FASThesis@dept\c@dept@kma}
\DeclareOption{kme}{\let\FASThesis@dept\c@dept@kme}

% default options
\ExecuteOptions{czech, kiv, ba, he, iso690alph, pdf}
\ProcessOptions\relax

% _____________________________________________________________________________
%
%        BASE CLASS LOADING
%        AND PACKAGE SETUPS
% _____________________________________________________________________________
%

% the base class loading
\LoadClass[12pt, a4paper, \FASThesis@print@sides]{memoir}
% font, font manipulation & encoding packages
\RequirePackage[utf8]{inputenc}
\RequirePackage[T1]{fontenc}
\RequirePackage[\FASThesis@lang]{babel}
% the recommended font that fits best the Unified Visual Style of UWB/FAS is 'cochineal'
\RequirePackage[p, cochineal]{newtx} % <== applicable are also: libertine, ebgaramond, vvarbb
\RequirePackage[cochineal]{newtxmath}
\RequirePackage[final, protrusion=true, kerning=true, babel=true, stretch=10, shrink=10, nopatch=item]{microtype} 

% conditional loading of the package for the czech quotes
\ifx\FASThesis@lang\c@czech%
	\RequirePackage{csquotes}
\fi%

% bibliography package
\ifx\FASThesis@lang\c@czech%
	\RequirePackage[backend=biber, bibencoding=utf8, style=\FASThesis@bibliography@style, maxnames=5, sortlocale=cs_CZ]{biblatex}
\else%
	\RequirePackage[backend=biber, bibencoding=utf8, style=\FASThesis@bibliography@style, maxnames=5]{biblatex}
\fi%

% graphics-enabling packages
\RequirePackage{graphicx}
\RequirePackage[dvipsnames]{xcolor} % <== the option 'usenames' removed for obsoleteness
\RequirePackage{eso-pic}
\RequirePackage[most]{tcolorbox}
\RequirePackage[nolinks, final]{qrcode}

% modifications of the page geometry
\newdimen\FASThesis@margin@left
\FASThesis@margin@left=37mm
\newdimen\FASThesis@margin@right
\FASThesis@margin@right=37mm
\newdimen\FASThesis@margin@top
\FASThesis@margin@top=33mm
\newdimen\FASThesis@margin@bottom
\FASThesis@margin@bottom=40mm
\newlength{\alphabet@width}
\settowidth{\alphabet@width}{\normalfont abcdefghijklmnopqrstuvwxyz}

\RequirePackage[a4paper, left=\FASThesis@margin@left, right=\FASThesis@margin@right,
	top=\FASThesis@margin@top, bottom=\FASThesis@margin@bottom, textwidth=2.3\alphabet@width]{geometry}

% TikZ package configuration
\RequirePackage{tikz}
\usetikzlibrary{positioning}

% hyperref package, so that we can typeset active URLs
\RequirePackage[hidelinks, unicode]{hyperref}
\def\UrlFont{\ttfamily\small}
\let\UrlSpecialsOld\UrlSpecials
\def\UrlSpecials{\UrlSpecialsOld\do\/{\Url@slash}\do\_{\Url@underscore}}
\def\Url@slash{\@ifnextchar/{\kern-.11em\mathchar47\kern-.2em}%
    {\kern-.0em\mathchar47\kern-.08em\penalty\UrlBigBreakPenalty}}
\def\Url@underscore{\nfss@text{\leavevmode\kern.06em\vbox{\hrule\@width.3em}}\linebreak[1]}

% modifications of chapter/section headers and tables
\RequirePackage[explicit]{titlesec}
\RequirePackage{booktabs}
\RequirePackage{longtable}

% other useful packages
\RequirePackage{listings}
\RequirePackage{xstring}
\@ifundefined{NewDocumentCommand}{
	\RequirePackage{xparse} % <== xparse package is needed as the loaded format is the older one (< LaTeX3)
}{\relax}

% set the active language at the very beginning of the document
\expandafter\AtBeginDocument%
	\expandafter{\expandafter\selectlanguage%
	\expandafter{\FASThesis@lang}}

% _____________________________________________________________________________
%
%        DEFINITIONS OF THE
%        BASIC DOCUMENT COLOURS
% _____________________________________________________________________________
%

% the official yellow of the Faculty of Applied Sciences as defined in the "Logomanuál ZČU 2021", pg 17
\definecolor{FASThesis@FASColor}{cmyk}{0.06, 0.27, 1.0, 0.12}
% the official yellow darkened by 10% (for better outcome when printed)
\definecolor{FASThesis@FASColorDarker}{cmyk}{0.05, 0.28, 1.0, 0.24}
% the official gray of the Faculty of Applied Sciences as defined in the "Logomanuál ZČU 2021", pg 17
\definecolor{FASThesis@UWBGray}{cmyk}{0.07, 0.04, 0.06, 0.19}
% the official blue of the University of West Bohemia as defined in the "Logomanuál ZČU 2021", pg 15
\definecolor{FASThesis@UWBBlue}{cmyk}{0.96, 0.69, 0, 0}
\definecolor{FASThesis@UXConBlue}{cmyk}{0.89, 0.83, 0, 0}
\definecolor{FASThesis@UXConGreen}{cmyk}{0.99, 0, 0.93, 0}
\definecolor{FASThesis@ImportantColor}{cmyk}{0, 1.0, 1.0, 0} % <== the colour used in the 'important' environment

% _____________________________________________________________________________
%
%        DEFINITIONS OF SIZES AND MEASURES
% _____________________________________________________________________________
%

% general size constants
\def\FASThesis@golden@ratio{0.61803398875023664980396737456965}%

% page component sizes
\newdimen\FASThesis@runninghead@rule@length%
\FASThesis@runninghead@rule@length=\dimexpr\FASThesis@golden@ratio\textwidth\relax%

% font sizes
\newdimen\FASThesis@title@size
\FASThesis@title@size=28pt

\newdimen\FASThesis@author@size
\FASThesis@author@size=21pt

\newdimen\FASThesis@type@size
\FASThesis@type@size=25pt

\newdimen\FASThesis@place@size
\FASThesis@place@size=12pt

\newdimen\FASThesis@chapter@size
\FASThesis@chapter@size=30pt

\newdimen\FASThesis@section@size
\FASThesis@section@size=21pt

\newdimen\FASThesis@subsection@size
\FASThesis@subsection@size=17pt

\newdimen\FASThesis@subsubsection@size
\FASThesis@subsubsection@size=14pt

% _____________________________________________________________________________
%
%        DEFINITIONS OF FONTS
% _____________________________________________________________________________
%

% check whether the LaTeX source is compiled by pdfLaTeX,
% if yes, setup the \ifpdflatex conditional
\newif\ifpdflatex%
	\ifx\pdfoutput\undefined%
	\else%
		\ifx\pdfoutput\relax%
		\else%
			\ifcase\pdfoutput\else\pdflatextrue\fi%
		\fi%
	\fi%

% if the LaTeX source is compiled by pdfLaTeX, add the map
% file for the 'GTAmerica' font
\ifpdflatex%
	\typeout{* FASThesis>> pdflatex detected. Adding the map file for the font 'GTAmerica'.}
	\pdfmapfile{+GTAmerica.map}%
\fi%

% fonts used on the front page and front matter
\font\GTAmerica@Title=GTAmerica-CondensedBold-lf-t1 at \FASThesis@title@size
\font\GTAmerica@Author=GTAmerica-CondensedRegular-lf-t1 at \FASThesis@author@size
\font\GTAmerica@Type=GTAmerica-CondensedBold-lf-t1 at \FASThesis@type@size
\font\GTAmerica@Place=GTAmerica-CondensedBold-lf-t1 at \FASThesis@place@size
\font\GTAmerica@FPAux=GTAmerica-CondensedRegular-lf-t1 at \dimexpr\FASThesis@place@size + 2pt\relax
\font\GTAmerica@FPAuxBf=GTAmerica-CondensedBold-lf-t1 at \dimexpr\FASThesis@place@size + 2pt\relax

% fonts used in the text
\font\GTAmericaBfChapterNum=GTAmerica-CondensedBold-lf-t1 at 52pt
\font\GTAmericaBfChapter=GTAmerica-CondensedBold-lf-t1 at \FASThesis@chapter@size
\font\GTAmericaBfSection=GTAmerica-CondensedBold-lf-t1 at \FASThesis@section@size
\font\GTAmericaRgSection=GTAmerica-CondensedRegular-lf-t1 at \FASThesis@section@size
\font\GTAmericaBfSubsection=GTAmerica-CondensedBold-lf-t1 at \FASThesis@subsection@size
\font\GTAmericaRgSubsection=GTAmerica-CondensedRegular-lf-t1 at \FASThesis@subsection@size
\font\GTAmericaBfSubsubsection=GTAmerica-CondensedBold-lf-t1 at \FASThesis@subsubsection@size
\font\GTAmericaRgSubsubsection=GTAmerica-CondensedRegular-lf-t1 at \FASThesis@subsubsection@size
\font\GTAmericaBf=GTAmerica-CondensedBold-lf-t1 at 12pt
\font\GTAmericaRg=GTAmerica-CondensedRegular-lf-t1 at 12pt

% font additions using LaTeX mechanism
\def\FASThesis@heading@font{GTAmerica-LF}

% _____________________________________________________________________________
%
%        LANGUAGE-DEPENDENT SETTINGS
% _____________________________________________________________________________
%

\ifx\FASThesis@lang\c@czech% <== the work is written in the *CZECH* language
	\def\FASThesis@university{Západočeská univerzita v Plzni}
	\def\FASThesis@faculty{Fakulta aplikovaných věd}
	\ifx\FASThesis@dept\c@dept@kfy%
		\def\FASThesis@department{Katedra fyziky}
	\fi
	\ifx\FASThesis@dept\c@dept@kgm%
		\def\FASThesis@department{Katedra geomatiky}
	\fi
	\ifx\FASThesis@dept\c@dept@kiv%
		\def\FASThesis@department{Katedra informatiky a výpočetní techniky}
	\fi
	\ifx\FASThesis@dept\c@dept@kky%
		\def\FASThesis@department{Katedra kybernetiky}
	\fi
	\ifx\FASThesis@dept\c@dept@kma%
		\def\FASThesis@department{Katedra matematiky}
	\fi
	\ifx\FASThesis@dept\c@dept@kme%
		\def\FASThesis@department{Katedra mechaniky}
	\fi

	\def\FASThesis@supervisor@label{Vedoucí práce}
	\newcommand{\FASThesis@supervisor}{neuveden.}
	\def\FASThesis@type@text@determ{tuto}

	\ifx\FASThesis@type\c@semestral%
		\def\FASThesis@type@text{Semestrální práce}
		\def\FASThesis@type@text@acc{semestrální práci}
	\fi
	\ifx\FASThesis@type\c@bachelors%
		\def\FASThesis@type@text{Bakalářská práce}
		\def\FASThesis@type@text@acc{bakalářskou práci}
	\fi
	\ifx\FASThesis@type\c@baproject%
		\def\FASThesis@type@text{Bakalářský projekt}
		\def\FASThesis@type@text@acc{bakalářský projekt}
		\def\FASThesis@supervisor@label{Vedoucí projektu}
		\def\FASThesis@type@text@determ{tento}
	\fi
	\ifx\FASThesis@type\c@masters%
		\def\FASThesis@type@text{Diplomová práce}
		\def\FASThesis@type@text@acc{diplomovou práci}
	\fi
	\ifx\FASThesis@type\c@rigorous%
		\def\FASThesis@type@text{Teze disertační práce}
		\def\FASThesis@type@text@acc{tezi disertační práce}
	\fi
	\ifx\FASThesis@type\c@doctoral%
		\def\FASThesis@type@text{Disertační práce}
		\def\FASThesis@type@text@acc{disertační práci}
	\fi
	\ifx\FASThesis@type\c@habilitation%
		\def\FASThesis@type@text{Habilitační práce}
		\def\FASThesis@type@text@acc{habilitační práci}
	\fi
	\ifx\FASThesis@type\c@other%
		\def\FASThesis@type@text{Práce}
		\def\FASThesis@type@text@acc{práci}
	\fi
	
	\def\FASThesis@place{Plzeň}
	\def\FASThesis@copyright@disclaimer{Všechna práva vyhrazena. Žádná část tohoto dokumentu
		nesmí být reprodukována ani rozšiřována jakoukoli formou, elektronicky či mechanicky,
		fotokopírováním, nahráváním nebo jiným způsobem, nebo uložena v systému pro ukládání
		a vyhledávání informací bez písemného souhlasu držitelů autorských práv.}
	\def\FASThesis@citation@record@title{Citace v seznamu literatury:}
	
	\ifx\FASThesis@sex\c@maleauthor\def\FASThesis@wrotethis{vypracoval}\fi
	\ifx\FASThesis@sex\c@femaleauthor\def\FASThesis@wrotethis{vypracovala}\fi
	
	\def\FASThesis@auth@statement@label{Prohlášení}
	\def\FASThesis@auth@statement@text{Prohlašuji, že jsem \FASThesis@type@text@determ{} \FASThesis@type@text@acc{}
		\FASThesis@wrotethis{} samostatně a výhradně s~použitím citovaných pramenů, literatury a dalších
		odborných zdrojů. Tato práce nebyla využita k~získání jiného nebo stejného akademického
		titulu.\newline\par\noindent%
		Beru na vědomí, že se na moji práci vztahují práva a povinnosti vyplývající ze zákona
		č.~121/2000 Sb., zákon o právu autorském, o právech souvisejících s právem autorským a o změně některých zákonů (autorský zákon) v platném znění, a zejména skutečnost, že Západočeská
		univerzita v~Plzni má právo na uzavření licenční smlouvy o užití této práce jako školního
		díla podle § 60 odst. 1 autorského zákona.}
	
	\def\FASThesis@trademark@statement{V textu jsou použity názvy produktů, technologií,
	služeb, aplikací, společností apod., které mohou být ochrannými známkami nebo registrovanými
	ochrannými známkami příslušných	vlastníků.}
	
	\def\FASThesis@abstract@label@primarylang{Abstrakt}
	\def\FASThesis@abstract@label@secondarylang{Abstract}
	\def\FASThesis@abstract@label@secondarylang@typeset{Abstract}
	\def\FASThesis@abstract@text@primarylang{\textit{Není k dispozici.}}
	\def\FASThesis@abstract@text@secondarylang{\textit{Not available at the moment.}}
	\def\FASThesis@keywords@label{Klíčová slova}
	\newcommand{\FASThesis@keywords}{\textsl{Žádná nebyla uvedena.}}
	
	\def\FASThesis@acknowledgement@label{Poděkování}
	\def\FASThesis@toc@label{Obsah}
	\def\FASThesis@listoffigures@label{Seznam obrázků}
	\def\FASThesis@listoftables@label{Seznam tabulek}
	\def\FASThesis@listoflistings@label{Seznam výpisů}
	
	\newcommand{\FASThesis@subject}{Neurčený předmět}
	
	\def\FASThesis@illegal@option@text{Neplatný přepínač!}
	
	\renewcommand{\lstlistingname}{Zdrojový kód}
	\def\FASThesis@listing@label{Výpis}
	
	% language-dependent text formatting (for Czech) in the traditional
	% Czech paragraph skipping is wanted ==> uncomment the following 2 lines
	%\setlength{\parindent}{2em}
	%\setlength{\parskip}{0pt}
\else\relax\fi%

\ifx\FASThesis@lang\c@english% <== the work is written in the *ENGLISH* language
	\def\FASThesis@university{University of West Bohemia}
	\def\FASThesis@faculty{Faculty of Applied Sciences}
	\ifx\FASThesis@dept\c@dept@kfy%
		\def\FASThesis@department{Department of Physics}
	\fi
	\ifx\FASThesis@dept\c@dept@kgm%
		\def\FASThesis@department{Department of Geomatics}
	\fi
	\ifx\FASThesis@dept\c@dept@kiv%
		\def\FASThesis@department{Department of Computer Science and Engineering}
	\fi
	\ifx\FASThesis@dept\c@dept@kky%
		\def\FASThesis@department{Department of Cybernetics}
	\fi
	\ifx\FASThesis@dept\c@dept@kma%
		\def\FASThesis@department{Department of Mathematics}
	\fi
	\ifx\FASThesis@dept\c@dept@kme%
		\def\FASThesis@department{Department of Mechanics}
	\fi

	\def\FASThesis@supervisor@label{Thesis advisor}
	\newcommand{\FASThesis@supervisor}{not specified.}

	\ifx\FASThesis@type\c@semestral%
		\def\FASThesis@type@text{Seminar Work}
	\fi
	\ifx\FASThesis@type\c@bachelors%
		\def\FASThesis@type@text{Bachelor's Thesis}
	\fi
	\ifx\FASThesis@type\c@baproject%
		\def\FASThesis@type@text{Bachelor's Project}
		\def\FASThesis@supervisor@label{Project advisor}
	\fi
	\ifx\FASThesis@type\c@masters%
		\def\FASThesis@type@text{Master's Thesis}
	\fi
	\ifx\FASThesis@type\c@rigorous%
		\def\FASThesis@type@text{State of the Art and Concepts of Ph.D. Thesis}
	\fi
	\ifx\FASThesis@type\c@doctoral%
		\def\FASThesis@type@text{Doctoral Dissertation}
	\fi
	\ifx\FASThesis@type\c@habilitation%
		\def\FASThesis@type@text{Habilitation Thesis}
	\fi
	\ifx\FASThesis@type\c@other%
		\def\FASThesis@type@text{Thesis}
	\fi
	
	\def\FASThesis@place{Pilsen, Czech Republic}	
	\def\FASThesis@copyright@disclaimer{All rights reserved. No part of this document may be reproduced
		or transmitted in any form by any means, electronic or mechanical including photocopying, recording
		or by any information storage and retrieval system, without permission from the copyright holder(s)
		in writing.}
	\def\FASThesis@citation@record@title{Citation in the bibliography/reference list:}
	
	\def\FASThesis@auth@statement@label{Declaration}
	\def\FASThesis@auth@statement@text{I hereby declare that this \FASThesis@type@text{} is completely
		my own work	and that I used only the cited sources, literature, and other resources. This work
		has not been used to obtain another or the same academic degree.
		\newline\par\noindent%
		I acknowledge that my work is subject to the rights and obligations arising from
		Act No. 121/2000 Coll., the Copyright Act as amended, in particular the fact that
		the University of West Bohemia has the right to enter into a licence agreement for
		the use of this work as a school work pursuant to Section 60(1) of the Copyright Act.}
	
	\def\FASThesis@trademark@statement{The names of products, technologies,
	services, applications, companies, etc. used in the text may be trademarks or
	registered trademarks of their respective owners.}
	
	\def\FASThesis@abstract@label@primarylang{Abstract}
	\def\FASThesis@abstract@label@secondarylang{Abstrakt}
	\def\FASThesis@abstract@label@secondarylang@typeset{Abstrakt}	
	\def\FASThesis@abstract@text@primarylang{\textsl{Not available at the moment.}}
	\def\FASThesis@abstract@text@secondarylang{\textsl{Není k dispozici.}}
	\def\FASThesis@keywords@label{Keywords}
	\newcommand{\FASThesis@keywords}{\textsl{None were given.}}
	
	\def\FASThesis@acknowledgement@label{Acknowledgement}
	\def\FASThesis@toc@label{Contents}
	\def\FASThesis@listoffigures@label{List of Figures}
	\def\FASThesis@listoftables@label{List of Tables}
	\def\FASThesis@listoflistings@label{List of Listings}
	
	\newcommand{\FASThesis@subject}{Unspecified Subject}
	
	\def\FASThesis@illegal@option@text{Illegal option!}
	
	\renewcommand{\lstlistingname}{Source code}
	\def\FASThesis@listing@label{Listing}
\else\relax\fi%

% _____________________________________________________________________________
%
%        LOCALLY USED COMMANDS & CONSTANTS
%        (PRIVATES)
% _____________________________________________________________________________
%

\let\FASThesis@frontmatter@aux@content\empty%
\let\FASThesis@flag@show@bastard@title\c@yes%
\let\FASThesis@flag@show@copyright@notice\c@yes%
\let\FASThesis@auth@statement@addendum\empty%

\long\gdef\@calc@trim< #1 >\@/< #2 >\@/< #3 >\@/< #4 >\@/< #5 >\@/< #6 >\@/< #7 >\@/< #8 >\@/< #9 >\@nihil{%
	\ifcase\numexpr2#3#8\relax\or#2\or#7\or#5\or#1\or#1\fi%
}

\long\gdef\trim#1{%
	\@calc@trim< #1 >\@/< #1>\@/< - >\@/< + >\@/< ? >\@/<#1 >\@/<#1>\@/< 0 >\@/< 2 >\@/< 1 >\@/< 3 >\@/< 2 >\@/< ! >\@nihil%
}

\def\FASThesis@colortext#1{%
	\ifx\FASThesis@style\c@fullcolor%
		{\textcolor{FASThesis@FASColorDarker}{#1}}%
	\else#1%
	\fi%
}

\def\FASThesis@chapter@title#1{%
	\fontsize{\FASThesis@chapter@size}{1.0\FASThesis@chapter@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@section@num#1{%
	\fontsize{\FASThesis@section@size}{1.0\FASThesis@section@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@section@title#1{%
	\fontsize{\FASThesis@section@size}{1.0\FASThesis@section@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@subsection@num#1{%
	\fontsize{\FASThesis@subsection@size}{1.0\FASThesis@subsection@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@subsection@title#1{%
	\fontsize{\FASThesis@subsection@size}{1.0\FASThesis@subsection@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@subsubsection@num#1{%
	\fontsize{\FASThesis@subsubsection@size}{1.0\FASThesis@subsubsection@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@subsubsection@title#1{%
	\fontsize{\FASThesis@subsubsection@size}{1.0\FASThesis@subsubsection@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@paragraph@num#1{%
	\fontsize{\f@size}{1.0\f@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@paragraph@title#1{%
	\fontsize{\f@size}{1.0\f@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
	\FASThesis@colortext{#1}%
}

\def\FASThesis@typeset@month#1{%
	\ifx\FASThesis@lang\c@czech%
		\ifcase#1%
			\relax\or%
			ledna\or%
			února\or%
			března\or%
			dubna\or%
			května\or%
			června\or%
			července\or%
			srpna\or%
			září\or%
			října\or%
			listopadu\or%
			prosince\else%
			srpence
		\fi%
	\fi%
	%
	\ifx\FASThesis@lang\c@english%
		\ifcase#1%
			\relax\or%
			January\or%
			February\or%
			March\or%
			April\or%
			May\or%
			June\or%
			July\or%
			August\or%
			September\or%
			October\or%
			November\or%
			December\else%
			Unknownber
		\fi%
	\fi%
}

% _____________________________________________________________________________
%
%        MODIFICATIONS/REDEFINITIONS OF
%        THE STANDARD LATEX/MEMOIR BEHAVIOUR
% _____________________________________________________________________________
%

\linespread{1.1} % <== this has probably 
\renewcommand*{\verbatim@font}{\ttfamily}

% correct Czech double quotes
\ifx\uv\undefined%
	\newcommand{\uv}[1]{\quotedblbase{#1}\textquotedblleft}%
\fi%

\frenchspacing%

\global\let\part\relax% <== the `\part' command can NOT be used throughout the document

% if the 'mathptmx' package is used for the Times New Roman font,
% these additional kerning pairs must be defined (thus, uncomment):
% \SetExtraKerning[unit=space]{encoding={*}, series={*}, size={*}}{
%	ď = {, -750},
%	ť = {, -850}
% }

\def\author#1#2#3#4{%
	\def\@author{#1~#2}%
	\def\FASThesis@auth@firstname{#1}%
	\def\FASThesis@auth@surname{#2}%
	\def\FASThesis@auth@frontdegs{#3}%
	\def\FASThesis@auth@behinddegs{#4}%
}

\def\supervisor#1{%
	\renewcommand{\FASThesis@supervisor}{#1}%
}

\newcommand{\FASThesis@day}{\the\day}
\newcommand{\FASThesis@month}{\the\month}
\newcommand{\FASThesis@year}{\the\year}
\newcommand{\FASThesis@signature@place}{V Plzni}
\catcode`\&=12 % changing temporarily the catcode for `&' so that it can be used as a normal character in an URL
\newcommand{\FASThesis@qrcode@baseurl}{https://portal.zcu.cz/StagPortletsJSR168/CleanUrl?urlid=prohlizeni-prace-detail&praceIdno=}
\catcode`\&=4 % changing the catcode for `&' back to column delimiter
\newcommand{\FASThesis@qrcode@workid}{\empty}

\def\setqrcodebaseurl#1{%
	\catcode`\&=12%
	\renewcommand{\FASThesis@qrcode@baseurl}{#1}%
	\catcode`\&=4%
}

\def\stagworkid#1{%
	\renewcommand{\FASThesis@qrcode@workid}{#1}%
}

\def\signdate#1#2#3#4{%
	\def\tempempty{}%
	\def\temparg{#1}%
	\ifx\temparg\tempempty\relax\else\renewcommand{\FASThesis@day}{#1}\fi%
	\def\temparg{#2}%
	\ifx\temparg\tempempty\relax\else\renewcommand{\FASThesis@month}{#2}\fi%
	\def\temparg{#3}%
	\ifx\temparg\tempempty\relax\else\renewcommand{\FASThesis@year}{#3}\fi%
	\def\temparg{#4}%
	\ifx\temparg\tempempty\relax\else\renewcommand{\FASThesis@signature@place}{#4}\fi%
}

\ifx\FASThesis@lang\c@czech%
	\newcommand{\FASThesis@assignment@pdf}{img/assgn-cz.pdf}%
\fi%
\ifx\FASThesis@lang\c@english%
	\newcommand{\FASThesis@assignment@pdf}{img/assgn-en.pdf}%
\fi%
\def\assignment#1{%
	\renewcommand{\FASThesis@assignment@pdf}{#1}%
}

\renewcommand{\abstract}[3][\FASThesis@abstract@label@secondarylang]{%
	\def\FASThesis@abstract@label@secondarylang@typeset{#1}%
	\def\FASThesis@abstract@text@primarylang{#2}%
	\def\FASThesis@abstract@text@secondarylang{#3}%
}

\newcommand{\FASThesis@acknowledgement@text}{}
\newcommand{\acknowledgement}[1]{%
	\renewcommand\FASThesis@acknowledgement@text{#1}%
}

\newcommand{\keywords}[1]{%
	\noexpandarg%
	\StrSubstitute[0]{#1}{, }{ \textbullet{} }[\FASThesis@temp@kwa]%
	\expandarg%
	\StrSubstitute[0]{\FASThesis@temp@kwa}{,}{ \textbullet{} }[\FASThesis@temp@kwb]%
	\renewcommand{\FASThesis@keywords}{\FASThesis@temp@kwb}%
}

\newcommand{\subject}[1]{%
	\renewcommand{\FASThesis@subject}{#1}%
}

% setting the sectioning depth for the base memoir class to paragraphs
\setsecnumdepth{paragraph} 
\maxtocdepth{subsection}

\renewcommand{\tableofcontents}{%
	\chapter*{\FASThesis@toc@label}{%
	\def\leftmark{\FASThesis@toc@label}%
	\def\rightmark{\FASThesis@toc@label}%
	\@starttoc{toc}%
	\newpage}%
}

\renewcommand{\listoffigures}{%
	\chapter*{\FASThesis@listoffigures@label}{%
	\def\leftmark{\FASThesis@listoffigures@label}%
	\def\rightmark{\FASThesis@listoffigures@label}%	
	\addcontentsline{toc}{chapter}{\FASThesis@listoffigures@label}%
	\@starttoc{lof}%
	\newpage}%
}

\renewcommand{\listoftables}{%
	\chapter*{\FASThesis@listoftables@label}{%
	\def\leftmark{\FASThesis@listoftables@label}%
	\def\rightmark{\FASThesis@listoftables@label}%		
	\addcontentsline{toc}{chapter}{\FASThesis@listoftables@label}%
	\@starttoc{lot}%
	\newpage}%
}

\newcommand{\listoflistings}{%
	\chapter*{\FASThesis@listoflistings@label}{%
	\def\leftmark{\FASThesis@listoflistings@label}%
	\def\rightmark{\FASThesis@listoflistings@label}%			
	\addcontentsline{toc}{chapter}{\FASThesis@listoflistings@label}%
	\@starttoc{lol}%
	\newpage}%
}

% _____________________________________________________________________________
%
%        HEADER & FOOTER (PAGESTYLE) STYLING
% _____________________________________________________________________________
%

\renewcommand{\makeheadrule}[3]{%
	\mem@ps@safe@change{#1}%
	\@namedef{#1headrule}{%
		\newdimen\FASThesis@runninghead@rule@offset%
		\ifodd\c@page%
			\FASThesis@runninghead@rule@offset=\dimexpr\textwidth-#2\relax%
		\else%
			\FASThesis@runninghead@rule@offset=0mm%
		\fi%
		\raisebox{\baselineskip}{%
			\hbox to \FASThesis@runninghead@rule@offset{}%
			\hbox to #2{\leavevmode\leaders\hrule\@width #2\@height #3\hfill\kern\z@}%
		}\vskip-#3%
	}%
}

\makepagestyle{fasthesisheadings}
\makeheadfootruleprefix{fasthesisheadings}{%
	\ifx\FASThesis@style\c@fullcolor%
		\color{FASThesis@FASColorDarker}%
	\else%
		\color{black}%
	\fi%
	\ifx\FASThesis@print@sides\c@oneside%
		\raggedleft%
	\else%
		\relax%
	\fi%
}{\color{black}}
\makeheadrule{fasthesisheadings}{\FASThesis@runninghead@rule@length}{%
	\ifx\FASThesis@style\c@fullcolor 3\else 1\fi\normalrulethickness%
}
\makeheadposition{fasthesisheadings}{flushright}{flushleft}{}{}
\ifx\FASThesis@print@sides\c@oneside%
	\makeevenhead{fasthesisheadings}{}{}{\small\itshape\rightmark}%
	\makeoddhead{fasthesisheadings}{}{}{\small\itshape\rightmark}%
\else%
	\makeevenhead{fasthesisheadings}{\small\itshape\leftmark}{}{}%
	\makeoddhead{fasthesisheadings}{}{}{\small\itshape\rightmark}%
\fi%
\makeevenfoot{fasthesisheadings}{\normalcolor\small\thepage}{}{} 
\makeoddfoot{fasthesisheadings}{}{}{\normalcolor\small\thepage}
\makepsmarks{fasthesisheadings}{
	\nouppercaseheads
	\createmark{chapter}{both}{shownumber}{}{ \ }
	\createmark{section}{right}{shownumber}{}{ \ }
	\createmark{subsection}{right}{shownumber}{}{ \ }
	\createmark{subsubsection}{right}{shownumber}{}{ \ }
	\createplainmark{toc}{both}{\contentsname}
	\createplainmark{lof}{both}{\listfigurename}
	\createplainmark{lot}{both}{\listtablename}
	\createplainmark{bib}{both}{\bibname}
	\createplainmark{index}{both}{\indexname}
	\createplainmark{glossary}{both}{\glossaryname}
}

\copypagestyle{fasthesisfrontmatter}{plain}
\makeevenfoot{fasthesisfrontmatter}{\normalcolor\small(\roman{page})}{}{} 
\makeoddfoot{fasthesisfrontmatter}{}{}{\normalcolor\small(\roman{page})}

% the following command modifies the standard `plain' style behaviour so that
% the pages with chapter beginnings are numbered consistently as in the
% `fasthesisheadings' style
\makeoddfoot{plain}{}{}{\normalcolor\small\thepage}

% _____________________________________________________________________________
%
%        TITLE PAGE, FRONT MATTER & BACK MATTER STYLING
% _____________________________________________________________________________
%

\newlength{\FASThesis@titlebox@width}
\newlength{\FASThesis@titlebox@height}
\newsavebox{\FASThesis@backpage@sign}

\renewcommand{\maketitle}{%
	%
	%	MAIN TITLE
	%
	{% -- the whole title page is a local environment (the modifications are not propagated)
	\enlargethispage{20mm}
	\addtolength{\topmargin}{-6mm}
	\thispagestyle{empty}

	\begin{titlingpage} % memoir.cls
		% include (if the class option 'pdf' was used) the background graphics
		\ifx\FASThesis@style\c@fullcolor%
			\ifx\FASThesis@nobggfx\empty\relax\else%
				\IfFileExists{img/background-\FASThesis@dept.pdf}{%
					\AddToShipoutPictureBG*{%
						\includegraphics[width=\paperwidth, height=\paperheight]{img/background-\FASThesis@dept}%
					}
				}{}%
			\fi%
		\else\relax\fi%

		% setting the title and author box
		\newsavebox{\FASThesis@titlebox}
		\savebox{\FASThesis@titlebox}{%
			\parbox{\textwidth}{%
				\let\FASThesis@flag@in@maintitle\c@yes%
				\raggedright%
				\fontsize{\FASThesis@title@size}{1.0\FASThesis@title@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%
				\textcolor{white}{\@title}\\[.666\baselineskip]% tiny clues are hidden everywhere, on the other hand this is just 2/3
				\fontsize{\FASThesis@author@size}{1.0\FASThesis@author@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
				\textcolor{white}{\@author}%
				\let\FASThesis@flag@in@maintitle\c@no%
			}%
		}
		
		\settowidth{\FASThesis@titlebox@width}{\usebox{\FASThesis@titlebox}}%
		\global\FASThesis@titlebox@width=\FASThesis@titlebox@width%
		\settoheight{\FASThesis@titlebox@height}{\usebox{\FASThesis@titlebox}}%
		\global\FASThesis@titlebox@height=\FASThesis@titlebox@height%
		
		% setting the main title
		\newdimen\FASThesis@auxdim@lx%
		\FASThesis@auxdim@lx=\dimexpr.5\FASThesis@titlebox@width+\FASThesis@margin@left\relax%
		\newdimen\FASThesis@auxdim@ly%
		\FASThesis@auxdim@ly=\dimexpr1.3\FASThesis@titlebox@height\relax%
		
		\begin{tikzpicture}[remember picture, overlay]
			\node[yshift=-\dimexpr0.666\paperheight\relax] at (current page.north west) {%
				\begin{tikzpicture}[remember picture, overlay]
					\draw (\FASThesis@auxdim@lx, \dimexpr2.6\FASThesis@titlebox@height+1.8\baselineskip\relax)%
						node{\hbox to \textwidth{%
							\GTAmerica@Type%
							\ifx\FASThesis@style\c@fullcolor\color{FASThesis@FASColor}\else\color{black}\fi%
							\FASThesis@type@text\hfil}%
						};
					% horizontal bar (background for the title) on the title page
					\ifx\FASThesis@style\c@fullcolor%
						\fill[FASThesis@FASColor] (0, 0) rectangle (\paperwidth, \dimexpr2.6\FASThesis@titlebox@height\relax);% 3.0
					\else%
						\fill[black] (0, 0) rectangle (\paperwidth, \dimexpr2.6\FASThesis@titlebox@height\relax);
					\fi%
					% typeset the main title box
					\draw (\FASThesis@auxdim@lx, \FASThesis@auxdim@ly)%
						node{\usebox{\FASThesis@titlebox}};
					% typeset the place and year
					\draw (\FASThesis@auxdim@lx, -77mm)%
						node{\hbox to \textwidth{%
							\GTAmerica@Place\ifx\FASThesis@style\c@fullcolor\color{FASThesis@FASColor}\else\color{black}\fi%
								\MakeUppercase{\FASThesis@place}\hfil{}\FASThesis@year}};
				\end{tikzpicture}%
			};%
		\end{tikzpicture}
	
		% logo
		\noindent%
		\ifx\FASThesis@lang\c@czech
			\ifx\FASThesis@style\c@fullcolor\includegraphics[height=25.2mm]{img/\FASThesis@dept-cmyk-cz}%
			\else\includegraphics[height=25.2mm]{img/\FASThesis@dept-black-cz}%
			\fi%
		\fi
		\ifx\FASThesis@lang\c@english
			\ifx\FASThesis@style\c@fullcolor\includegraphics[height=25.2mm]{img/\FASThesis@dept-cmyk-en}%
			\else\includegraphics[height=25.2mm]{img/\FASThesis@dept-black-en}%
			\fi%
		\fi
	% conditional termination of the title page
	\ifx\FASThesis@flag@show@bastard@title\c@yes%
		\end{titlingpage}% <== bastard title will be typeset, the main title must be ended here
	\else%
		\ifx\FASThesis@flag@show@copyright@notice\c@no%
			\end{titlingpage}% <== no bastard title and no copyright notice, thus, end title page here
		\fi%
	\fi%
	%
	%	BASTARD TITLE
	%
	\ifx\FASThesis@flag@show@bastard@title\c@yes% <== do not typeset bastard title if the \nobastardtitle command was issued
	\newpage%
	\enlargethispage{20mm}%
	\thispagestyle{empty}%
	
	\begin{titlingpage}% <== bastard title (b/w only)
		% setting the title and author box
		\newsavebox{\FASThesis@titlebox@bw}%
		\savebox{\FASThesis@titlebox@bw}{%
			\parbox{\textwidth}{%
				\let\FASThesis@flag@in@maintitle\c@yes%
				\raggedright%
				\fontsize{\FASThesis@title@size}{1.0\FASThesis@title@size}\usefont{T1}{GTAmerica-LF}{bc}{n}%				
				\@title\\[.666\baselineskip]%
				\fontsize{\FASThesis@author@size}{1.0\FASThesis@author@size}\usefont{T1}{GTAmerica-LF}{c}{n}%
				\ifx\FASThesis@auth@frontdegs\empty\relax\else\FASThesis@auth@frontdegs~\fi%
				\@author%
				\ifx\FASThesis@auth@behinddegs\empty\relax\else,~\FASThesis@auth@behinddegs\fi%
				\let\FASThesis@flag@in@maintitle\c@no%
			}%
		}%
		
		\settowidth{\FASThesis@titlebox@width}{\usebox{\FASThesis@titlebox@bw}}%
		\settoheight{\FASThesis@titlebox@height}{\usebox{\FASThesis@titlebox@bw}}%
		
		% setting the main title
		\newdimen\FASThesis@auxdim@lx%
		\FASThesis@auxdim@lx=\dimexpr.5\FASThesis@titlebox@width+\FASThesis@margin@left\relax%
		\newdimen\FASThesis@auxdim@ly%
		\FASThesis@auxdim@ly=\dimexpr1.3\FASThesis@titlebox@height\relax%
		
		\def\tempsupervisorlabel{~}%
		\def\tempsupervisor{~}%
		\ifx\FASThesis@type\c@semestral\relax\else%
		\ifx\FASThesis@type\c@habilitation\relax\else%
		\ifx\FASThesis@type\c@other\relax\else%
			\def\tempsupervisorlabel{\FASThesis@supervisor@label}%
			\def\tempsupervisor{\FASThesis@supervisor}%
		\fi\fi\fi%
		
		\begin{tikzpicture}[remember picture, overlay]
			\node[yshift=-\dimexpr0.666\paperheight\relax] at (current page.north west) {%
				\begin{tikzpicture}[remember picture, overlay]
					\draw (\FASThesis@auxdim@lx, \dimexpr2.6\FASThesis@titlebox@height+1.8\baselineskip\relax)%
						node{\hbox to \textwidth{%
							\GTAmerica@Type\FASThesis@type@text\hfil}};
					\draw (\FASThesis@auxdim@lx, \FASThesis@auxdim@ly)%
						node{\usebox{\FASThesis@titlebox@bw}};
					\draw (\FASThesis@auxdim@lx, -33mm)%
						node{\parbox{\textwidth}{%
							\raggedright\GTAmerica@FPAuxBf\tempsupervisorlabel\\[.14\baselineskip]
							\GTAmerica@FPAux\tempsupervisor}};
					\draw (\FASThesis@auxdim@lx, -77mm)%
						node{\hbox to \textwidth{%
							\GTAmerica@Place%
								\MakeUppercase{\FASThesis@place}\hfil{}\FASThesis@year}};
				\end{tikzpicture}%
			};%
		\end{tikzpicture}

		% logo in b/w
		\noindent%
		\ifx\FASThesis@lang\c@czech%
			\includegraphics[height=25.2mm]{img/\FASThesis@dept-black-cz}
		\fi%
		\ifx\FASThesis@lang\c@english%
			\includegraphics[height=25.2mm]{img/\FASThesis@dept-black-en}
		\fi%
		% conditional termination of the bastard title page
		\ifx\FASThesis@flag@show@copyright@notice\c@no%
			\end{titlingpage}% <== no copyright notice, thus, the bastard title ends here
		\fi%
	\fi%
	%
	%	COPYRIGHT NOTICE AND CITATION RECORD
	%
	\ifx\FASThesis@flag@show@copyright@notice\c@yes% <== do not typeset the copyright notice if the \nocopyrightnotice command was issued
		\newpage%
		\enlargethispage{20mm}%
		\thispagestyle{empty}%
	
		% the copyright notice on the verso of the main or bastard title page and the citation record on the
		% next page (according to whether \nobastardtitle and/or \nocopyrightnotice commands were issued
		\vspace*{0.5\textheight}\noindent%
		\ifx\FASThesis@lang\c@czech%
			\copyright{} \@author, \FASThesis@year{}\\[\baselineskip]
		\fi%
		\ifx\FASThesis@lang\c@english%
			\copyright{} \FASThesis@year{} \@author\\[\baselineskip]
		\fi%
		\FASThesis@copyright@disclaimer\\[2\baselineskip]
		%
		\textbf{\FASThesis@citation@record@title}\\
		\MakeUppercase{\FASThesis@auth@surname}, \FASThesis@auth@firstname. \textsl{\@title}.
		\FASThesis@place, \FASThesis@year. \FASThesis@type@text. \FASThesis@university, \FASThesis@faculty,
		\FASThesis@department. %
		\ifx\FASThesis@type\c@semestral\relax\else%
		\ifx\FASThesis@type\c@habilitation\relax\else%
		\ifx\FASThesis@type\c@other\relax\else%
			\FASThesis@supervisor@label{} \FASThesis@supervisor%
			\edef\temp{\trim{\FASThesis@supervisor}}%
			\IfEndWith{\temp}{.}{}{.}%
		\fi\fi\fi%
	\end{titlingpage}
	\else\relax\fi%
	}%
}

\def\FASThesis@typeset@assignments{%
	% 1st page of the assignment
	\clearpage\thispagestyle{empty}
	\IfFileExists{\FASThesis@assignment@pdf}{%
		\AddToShipoutPictureBG*{%
			\includegraphics[width=\paperwidth, height=\paperheight, page=1]{\FASThesis@assignment@pdf}%
			\global\def\FASThesis@assignment@numberofpages{\pdflastximagepages}
		}%
		\mbox{}%
	}
	{\vspace*{.5\textheight}\parbox[b]{\textwidth}{\raggedright%
		Místo této strany bude přední strana zadání vaší kvalifikační práce.}%
	}%
	% 2nd page of the assignment
	\newpage\thispagestyle{empty}%
	\IfFileExists{\FASThesis@assignment@pdf}{%
		\ifnum\FASThesis@assignment@numberofpages>1%
			\AddToShipoutPictureBG*{%
				\includegraphics[width=\paperwidth, height=\paperheight, page=2]{\FASThesis@assignment@pdf}%
			}%
		\fi%			
		\mbox{}%
	}%
	{\vspace*{.5\textheight}\parbox[b]{\textwidth}{\raggedright%
		Místo této strany bude zadní strana zadání vaší kvalifikační práce.}%
	}%
	\newpage%
}

\def\FASThesis@typeset@declarations#1{%
	\setcounter{page}{1}%
	\noindent{\FASThesis@section@title{\FASThesis@auth@statement@label}}\\[\baselineskip]
	\FASThesis@auth@statement@text\\%
	\par\noindent%
	\ifx\FASThesis@auth@statement@addendum\empty\relax\else%
		\FASThesis@auth@statement@addendum\\%
		\par\noindent%
	\fi
	\ifx\FASThesis@lang\c@czech%
		\FASThesis@signature@place{} dne
		\FASThesis@day.~\FASThesis@typeset@month{\FASThesis@month}~\FASThesis@year\\[5\baselineskip]%
	\fi
	\ifx\FASThesis@lang\c@english%
		\FASThesis@signature@place{}, on
		\FASThesis@day~\FASThesis@typeset@month{\FASThesis@month}~\FASThesis@year\\[5\baselineskip]%
	\fi
	\hbox to \textwidth{\hfil\hbox to 75mm{\dotfill}}\\% <== signature line
	\hbox to \textwidth{\hfil\hbox to 75mm{%
		\hfil\FASThesis@auth@firstname{} \FASThesis@auth@surname\hfil}}% <== signee's name
	%
	% trademark statement:
	% if [tm], typeset the trademark statement,
	% if [notm], leave the bottom of the page empty,
	% otherwise print out the error message.
	\def\temparg{#1}%
	\def\temptm{tm}%
	\def\tempnotm{notm}%
	%
	\ifx\FASThesis@auth@statement@addendum\empty%
		\vspace*{92mm}\par\noindent%
	\else
		\vspace*{55mm}\par\noindent%
	\fi%
	\ifx\temparg\temptm%
		\FASThesis@trademark@statement%
	\else%
	\ifx\temparg\tempnotm\relax%
	\else%
		\textcolor{red}{\textbf{\FASThesis@illegal@option@text{} --- \jobname: l.\the\inputlineno}}%
	\fi\fi%
	\newpage%
}

\def\FASThesis@typeset@abstracts{%
	\noindent%
	{\FASThesis@section@title{\FASThesis@abstract@label@primarylang}}\\[\baselineskip]
	\FASThesis@abstract@text@primarylang%
	\vspace*{3\baselineskip}%
	\par\noindent%
	{\FASThesis@section@title{\FASThesis@abstract@label@secondarylang@typeset}}\\[\baselineskip]
	\FASThesis@abstract@text@secondarylang%
	\vspace*{3\baselineskip}%
	\par\noindent%
	{\FASThesis@subsection@title{\FASThesis@keywords@label}}\\[\baselineskip]
	\FASThesis@keywords%
	\newpage%
}

\def\FASThesis@typeset@acknowledgement{%
	\def\tempempty{}
	\if\tempempty\FASThesis@acknowledgement@text\relax\else%
		\noindent%
		{\FASThesis@section@title{\FASThesis@acknowledgement@label}}\\[\baselineskip]
		\FASThesis@acknowledgement@text\vspace*{3\baselineskip}%
		\newpage%
	\fi%
}

\newcommand{\frontpages}[1][tm]{%
	\frontmatter%
	\maketitle%
	\pagestyle{fasthesisfrontmatter}
	\ifx\FASThesis@type\c@semestral\relax\else%
	\ifx\FASThesis@type\c@other\relax\else%
		\ifx\FASThesis@type\c@baproject\relax\else%
		\ifx\FASThesis@type\c@rigorous\relax\else%
		\ifx\FASThesis@type\c@doctoral\relax\else%
		\ifx\FASThesis@type\c@habilitation\relax\else%
			\FASThesis@typeset@assignments%
		\fi\fi\fi\fi%
		\FASThesis@typeset@declarations{#1}%
		\FASThesis@typeset@abstracts%
		\FASThesis@typeset@acknowledgement%
	\fi\fi%
	\ifx\FASThesis@frontmatter@aux@content\empty\relax\else%
		\FASThesis@frontmatter@aux@content%
	\fi%
	\mainmatter%
	\pagestyle{fasthesisheadings}%
	\global\let\frontpages\relax% << the \frontpages command can only be used once per document
}

\newcommand{\setbackpagepic}[1]{%
	\savebox{\FASThesis@backpage@sign}{%
		\includegraphics[width=.2\textwidth]{#1}	
	}
}

\newcommand{\setbackpageqrcode}{%
	\@ifnextchar\bgroup\@lpar@setbackpageqrcode\@lnopar@setbackpageqrcode%
}

\def\@lpar@setbackpageqrcode#1{%
	\savebox{\FASThesis@backpage@sign}{%
		\colorbox{white}{\qrcode[height=.2\textwidth]{#1}}%
	}%
}

\def\@lnopar@setbackpageqrcode{%
	\def\tempcontent{\FASThesis@qrcode@baseurl\FASThesis@qrcode@workid}%
	\savebox{\FASThesis@backpage@sign}{%
		\colorbox{white}{\qrcode[height=.2\textwidth]{\tempcontent}}%
	}%
}

\newcommand{\backpage}{%
	\clearpage\thispagestyle{empty}%
	% include (if the class option 'pdf' was used) the background graphics
	\ifx\FASThesis@style\c@fullcolor%
		\ifx\FASThesis@nobggfx\empty\relax\else%
			\IfFileExists{img/background-\FASThesis@dept.pdf}{%
				\AddToShipoutPictureBG*{%
					\includegraphics[width=\paperwidth, height=\paperheight]{img/background-\FASThesis@dept}%
				}%
				\mbox{}%
			}{}%
		\fi%
		
		\begin{tikzpicture}[remember picture, overlay]
			\node[yshift=-\dimexpr.666\paperheight\relax] at (current page.north west) {%
				\begin{tikzpicture}[remember picture, overlay]
					\fill[FASThesis@FASColor] (0, 0) rectangle (\paperwidth, \dimexpr2.6\FASThesis@titlebox@height\relax);
				\end{tikzpicture}%
			};%
			\ifx\FASThesis@backpage@sign\empty%
				\relax%
			\else%
				%\newlength{\FASThesis@backpage@img@width}
				%\settowidth{\FASThesis@backpage@img@width}{\usebox{\FASThesis@backpage@img}}%
				\node[inner sep=0pt, yshift=-\dimexpr.666\paperheight\relax,
				      xshift=\dimexpr.5\paperwidth\relax] at (current page.north west)%
					{\usebox{\FASThesis@backpage@sign}};%
			\fi%
		\end{tikzpicture}%	
	\else\relax\fi%
	\global\let\backpage\relax% <== the \backpage command can only be used once per document
}

\newcommand{\nobastardtitle}{%
	\let\FASThesis@flag@show@bastard@title\c@no%
}

\newcommand{\nocopyrightnotice}{%
	\let\FASThesis@flag@show@copyright@notice\c@no%
}

% _____________________________________________________________________________
%
%        DOCUMENT STYLING COMMANDS
% _____________________________________________________________________________
%

\def\hbarfill{%
	\ifx\FASThesis@style\c@fullcolor%
		\textcolor{FASThesis@FASColorDarker}{\leavevmode\leaders\hrule height 2pt\hfill\kern\z@}%
	\else%
		\leavevmode\leaders\hrule height 2pt\hfill\kern\z@%
	\fi%
}

\newsavebox{\FASThesis@chapter@num@box}
\newsavebox{\FASThesis@section@num@box}
\newsavebox{\FASThesis@subsection@num@box}
\newsavebox{\FASThesis@subsubsection@num@box}
\newlength{\FASThesis@chapter@num@width}
\newlength{\FASThesis@chapter@title@width}
\newlength{\FASThesis@chapter@title@maxspace}
\newlength{\FASThesis@section@num@width}
\newlength{\FASThesis@section@title@maxspace}
\newlength{\FASThesis@subsection@num@width}
\newlength{\FASThesis@subsection@title@maxspace}
\newlength{\FASThesis@subsubsection@num@width}
\newlength{\FASThesis@subsubsection@title@maxspace}
\newlength{\FASThesis@sect@temp@gap}

\titleformat{\chapter}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@chapter\c@yes%
		\savebox{\FASThesis@chapter@num@box}{%
			\ifx\FASThesis@style\c@fullcolor\def\ch@hd@color{FASThesis@FASColorDarker}\else\def\ch@hd@color{black}\fi%
			\fboxsep=4mm\fboxrule=0mm%
			\fcolorbox{white}{\ch@hd@color}{%
				\hbox to 19mm{%
					\hfil%
					\textcolor{white}{\GTAmericaBfChapterNum\thechapter}%
					\hfil%
				}%
			}%
		}%
		%
		\settowidth{\FASThesis@chapter@title@width}{\FASThesis@chapter@title{#1}}%
		\settowidth{\FASThesis@chapter@num@width}{\usebox{\FASThesis@chapter@num@box}}%
		\setlength{\FASThesis@chapter@title@maxspace}{%
			\dimexpr\textwidth - \FASThesis@chapter@num@width - 3em\relax%
		}%
		%
		\hbox to \dimexpr\textwidth - \FASThesis@chapter@num@width\relax{%
			\ifdim\FASThesis@chapter@title@width>\FASThesis@chapter@title@maxspace%
				\parbox[t]{\FASThesis@chapter@title@maxspace}{%
					\raggedright\FASThesis@chapter@title{#1}%
				}%
			\else%
				\FASThesis@chapter@title{#1}%
				\hspace{1em}
			\fi%
			\hbarfill%
		}%
		%
		\hbox to \FASThesis@chapter@num@width{%
			\raisebox{-15pt}{\usebox{\FASThesis@chapter@num@box}}
		}%
	}{\let\FASThesis@flag@in@chapter\c@no}

\titleformat{name=\chapter, numberless}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@chapter\c@yes%
		\FASThesis@chapter@title{#1}%
	}{\let\FASThesis@flag@in@chapter\c@no}

\titleformat{\section}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@section\c@yes%
		\savebox{\FASThesis@section@num@box}{%
			\FASThesis@section@num{\thesection%
				%\ifx\FASThesis@lang\c@czech.\else\relax\fi%
			}%
			\hskip.618\baselineskip%
		}%
		\settowidth{\FASThesis@section@num@width}{\usebox{\FASThesis@section@num@box}}%
		\global\FASThesis@section@num@width=\FASThesis@section@num@width%
		\setlength{\FASThesis@section@title@maxspace}{%
			\dimexpr\textwidth - \FASThesis@section@num@width\relax%
		}%
		\usebox{\FASThesis@section@num@box}%
		\parbox[t]{\FASThesis@section@title@maxspace}{%
			\raggedright\FASThesis@section@title{#1}%
		}%
	}{\let\FASThesis@flag@in@section\c@no}

\titleformat{name=\section, numberless}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@section\c@yes%
		\FASThesis@section@title{#1}%
	}{\let\FASThesis@flag@in@section\c@no}

\titleformat{\subsection}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@subsection\c@yes%
		\savebox{\FASThesis@subsection@num@box}{%
			\FASThesis@subsection@num{\thesubsection%
				%\ifx\FASThesis@lang\c@czech.\else\relax\fi%
			}%
			\hskip.618\baselineskip% .834
		}%
		\settowidth{\FASThesis@subsection@num@width}{\usebox{\FASThesis@subsection@num@box}}%
		\global\FASThesis@subsection@num@width=\FASThesis@subsection@num@width%
		% check if the previous number of section is wider than the current subsection number
		\ifnum\FASThesis@section@num@width>\FASThesis@subsection@num@width%
			\setlength{\FASThesis@sect@temp@gap}{\dimexpr\FASThesis@section@num@width - \FASThesis@subsection@num@width\relax}%
		\else%
			\setlength{\FASThesis@sect@temp@gap}{0mm}%
		\fi%
		\setlength{\FASThesis@subsection@title@maxspace}{%
			\dimexpr\textwidth - \FASThesis@subsection@num@width\relax%
		}%		
		\usebox{\FASThesis@subsection@num@box}%
		\hskip\FASThesis@sect@temp@gap%
		\parbox[t]{\FASThesis@subsection@title@maxspace}{%
			\raggedright\FASThesis@subsection@title{#1}%
		}%
	}{\let\FASThesis@flag@in@subsection\c@no}

\titleformat{name=\subsection, numberless}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@subsection\c@yes%
		\FASThesis@subsection@title{#1}%
	}{\let\FASThesis@flag@in@subsection\c@no}

\titleformat{\subsubsection}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@subsubsection\c@yes%
		\savebox{\FASThesis@subsubsection@num@box}{%
			\FASThesis@subsubsection@num{\thesubsubsection%
				%\ifx\FASThesis@lang\c@czech.\else\relax\fi%
			}%
			\hskip.618\baselineskip% .539
		}%
		\settowidth{\FASThesis@subsubsection@num@width}{\usebox{\FASThesis@subsubsection@num@box}}%
		% check if the previous number of section is wider than the current subsection number
		\ifnum\FASThesis@subsection@num@width>\FASThesis@subsubsection@num@width%
			\setlength{\FASThesis@sect@temp@gap}{\dimexpr\FASThesis@subsection@num@width - \FASThesis@subsubsection@num@width\relax}%
		\else%
			\setlength{\FASThesis@sect@temp@gap}{0mm}%
		\fi%
		\setlength{\FASThesis@subsubsection@title@maxspace}{%
			\dimexpr\textwidth - \FASThesis@subsubsection@num@width\relax%
		}%
		\usebox{\FASThesis@subsubsection@num@box}%
		\hskip\FASThesis@sect@temp@gap%
		\parbox[t]{\FASThesis@subsubsection@title@maxspace}{%
			\raggedright\FASThesis@subsubsection@title{#1}%
		}%
	}{\let\FASThesis@flag@in@subsubsection\c@no}
	
\titleformat{name=\subsubsection, numberless}[block]
	{}{}{0pt}{%
		\let\FASThesis@flag@in@subsubsection\c@yes%
		\FASThesis@subsubsection@title{#1}%
	}{\let\FASThesis@flag@in@subsubsection\c@no}

\def\paragraph#1{%
	\let\FASThesis@flag@in@paragraph\c@yes%
	\hspace{\baselineskip}%
	\par\noindent{\FASThesis@paragraph@title{#1}\FASThesis@paragraph@num{.~}}%
	\let\FASThesis@flag@in@paragraph\c@no%
}

% _____________________________________________________________________________
%
%        BIBLIOGRAPHY STYLING COMMANDS
% _____________________________________________________________________________
%

%\DeclareUnicodeCharacter{0301}{´}
\ifx\FASThesis@bibliography@style\c@ftalpha%
	% the bibliography style is modified only in the case when the class file
	% user selects 'ftalph' (or nothing) in the optional switches of the initial
	% \documentclass command

	% \DeclareBibliographyDriver{book}{%
		% \printnames{author}%
		% \newunit\newblock%
		% \printfield{title}%
		% \newunit\newblock%
		% \printlist{publisher}%
		% \newunit%
		% \printlist{location}%
		% \newunit%
		% \printfield{year}%
		% \finentry%
	% }
	
	% \DeclareFieldFormat{title}{\emph{#1}}
	\relax%
\else%
	\relax%
\fi%

% _____________________________________________________________________________
%
%        CLASS-SPECIFIC NEW COMMANDS/ENVIRONMENTS
% _____________________________________________________________________________
%

\newlength{\FASThesis@button@font@size}%
\newlength{\FASThesis@sans@font@size}%
\newlength{\FASThesis@typewriter@font@size}%

\def\auxfrontmattercontent#1{%
	\def\FASThesis@frontmatter@aux@content{#1}%
}

\def\auxdeclaration#1{%
	\def\FASThesis@auth@statement@addendum{#1}%
}

\def\ttfamily{%
	\fontencoding{T1}\fontfamily{newtxtt}%
	\fontseries{m}\fontshape{n}%
	\fontsize{0.92\dimexpr\f@size pt\relax}{\baselineskip}%
	\selectfont%
}

\def\ttbfamily{%
	\fontencoding{T1}\fontfamily{newtxtt}%
	\fontseries{b}\fontshape{n}%
	\fontsize{0.92\dimexpr\f@size pt\relax}{\baselineskip}%
	\selectfont%
}

\NewDocumentCommand{\filename}{v}{{\ttfamily\detokenize{#1}}}%
\NewDocumentCommand{\command}{v}{{\ttfamily\detokenize{#1}}}%

\def\FASThesis@typeset@win@path#1{%
	\edef\FASThesis@temp@fna{\detokenize{#1}}%
	\StrSubstitute{\FASThesis@temp@fna}{/}{\textbackslash}%
}

\def\textbsf#1{%
	\setlength{\FASThesis@sans@font@size}{1.0\dimexpr\f@size pt\relax}%
	\ifx\FASThesis@flag@in@maintitle\c@yes\relax\else%
	\ifx\FASThesis@flag@in@chapter\c@yes\relax\else%
	\ifx\FASThesis@flag@in@section\c@yes\relax\else%
	\ifx\FASThesis@flag@in@subsection\c@yes\relax\else%
	\ifx\FASThesis@flag@in@subsubsection\c@yes\relax\else%
	\ifx\FASThesis@flag@in@paragraph\c@yes\relax\else%
	\setlength{\FASThesis@sans@font@size}{.87\dimexpr\f@size pt\relax}\fi\fi\fi\fi\fi\fi%
	{\fontsize{\FASThesis@sans@font@size}{\baselineskip}%
	\usefont{T1}{GTAmerica-LF}{sbc}{n}#1}%
}

\def\textsf#1{%
	\setlength{\FASThesis@sans@font@size}{1.0\dimexpr\f@size pt\relax}%
	\ifx\FASThesis@flag@in@maintitle\c@yes\relax\else%
	\ifx\FASThesis@flag@in@chapter\c@yes\relax\else%
	\ifx\FASThesis@flag@in@section\c@yes\relax\else%
	\ifx\FASThesis@flag@in@subsection\c@yes\relax\else%
	\ifx\FASThesis@flag@in@subsubsection\c@yes\relax\else%
	\ifx\FASThesis@flag@in@paragraph\c@yes\relax\else%
	\setlength{\FASThesis@sans@font@size}{.87\dimexpr\f@size pt\relax}\fi\fi\fi\fi\fi\fi%
	{\fontsize{\FASThesis@sans@font@size}{\baselineskip}%
	\usefont{T1}{GTAmerica-LF}{mc}{n}#1}%
}

\def\texttt#1{%
	{\fontencoding{T1}\fontfamily{newtxtt}%
	\fontseries{m}\fontshape{n}%
	\ifx\FASThesis@flag@in@maintitle\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\ifx\FASThesis@flag@in@chapter\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\ifx\FASThesis@flag@in@section\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\ifx\FASThesis@flag@in@subsection\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\ifx\FASThesis@flag@in@subsubsection\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\ifx\FASThesis@flag@in@paragraph\c@yes\fontsize{1.1\dimexpr\f@size pt\relax}{\baselineskip}\else%
	\fontsize{0.92\dimexpr\f@size pt\relax}{\baselineskip}\fi\fi\fi\fi\fi\fi%
	\selectfont#1}%
}

\def\term#1{{\bfseries\itshape #1}}
\def\product#1{\textbsf{#1}}

\def\button#1{%
	\setlength{\FASThesis@button@font@size}{.9\dimexpr\f@size pt\relax}%
	{%
	\setlength{\fboxsep}{.15\dimexpr\f@size pt\relax}%
	\framebox{%
		\fontsize{\FASThesis@button@font@size}{\baselineskip}%
		\usefont{T1}{GTAmerica-LF}{bc}{n}#1%
	}}%
}

\newtcbox{\hotkey}{%
	on line, colback=white, colframe=black, boxsep=0pt, boxrule=0pt, size=small, arc=2pt,%
	toprule=.5pt, bottomrule=.5pt, leftrule=1pt, rightrule=1pt,%
	top=0pt, bottom=0pt, left=0pt, right=0pt,%
	fontupper=\fontsize{.87\dimexpr\f@size pt\relax}{\baselineskip}\usefont{T1}{GTAmerica-LF}{mc}{n}%
}

\newcommand{\winprompt}{}
\newcommand{\uxprompt}{}
\newcommand{\setwinprompt}[1]{%
	\renewcommand{\winprompt}{%
		{\bfseries\FASThesis@typeset@win@path{#1}>}%
	}%
}
\newcommand{\setuxprompt}[2]{%
	\global\def\uxprompt{%
		{\ifx\FASThesis@style\c@fullcolor\color{FASThesis@UXConGreen}\else\color{black}\fi%
			\bfseries#1}{\bfseries:}%
		{\ifx\FASThesis@style\c@fullcolor\color{FASThesis@UXConBlue}\else\color{black}\fi%
			\bfseries#2}{\bfseries\$~}%
	}%
}

\ifx\FASThesis@type\c@other%
	\newcommand{\worktypespec}[1]{%
		\def\FASThesis@type@text{#1}%
	}%
\fi%

\lstdefinestyle{FASThesisLstStyle}{
	backgroundcolor=\color{white},
	commentstyle=\rmfamily\itshape\color{gray},
	keywordstyle=\bfseries,
	numberstyle=\tiny\color{gray},
	stringstyle=\color{black},
	basicstyle=\ttfamily\footnotesize,
	breakatwhitespace=false,
	breaklines=true,
	captionpos=t,
	frame=tb,
	rulecolor=\color{lightgray},
	keepspaces=true,
	numbers=left,
	numbersep=5pt,
	showspaces=false,
	showstringspaces=true,
	showtabs=false,
	tabsize=2,
	columns=fullflexible,
	extendedchars=true,
	literate={á}{{\'a}}1 {č}{{\v{c}}}1 {ď}{{\v{d}}}1 {é}{{\'e}}1 {ě}{{\v{e}}}1 {è}{{\`{e}}}1 {í}{{\'{\i}}}1 {ľ}{{\v{l}}}1 {ň}{{\v{n}}}1 {ó}{{\'o}}1 {ŕ}{{\'r}}1 {ř}{{\v{r}}}1 {š}{{\v{s}}}1 {ť}{{\v{t}}}1 {ú}{{\'u}}1 {ů}{{\r{u}}}1 {ý}{{\'y}}1 {ž}{{\v{z}}}1
	{Á}{{\'A}}1 {Č}{{\v{C}}}1 {Ď}{{\v{D}}}1 {É}{{\'E}}1 {Ě}{{\v{E}}}1 {È}{{\`{E}}}1 {Í}{{\'I}}1 {Ľ}{{\v{L}}}1 {Ň}{{\v{N}}}1 {Ó}{{\'O}}1 {Ŕ}{{\'R}}1 {Ř}{{\v{R}}}1 {Š}{{\v{S}}}1 {Ť}{{\v{T}}}1 {Ú}{{\'U}}1 {Ů}{{\r{U}}}1 {Ý}{{\'Y}}1 {Ž}{{\v{Z}}}1
}

\lstdefinestyle{FASThesisConStyle}{
	backgroundcolor=\color{FASThesis@UWBGray!25},
	numberstyle=\tiny\color{gray},
	basicstyle=\ttfamily\footnotesize,
	breakatwhitespace=true,
	breaklines=true,
	captionpos=t,
	frame=single,
	rulecolor=\color{lightgray},
	keepspaces=true,
	numbers=left,
	numbersep=5pt,
	showspaces=false,
	showstringspaces=true,
	showtabs=false,
	tabsize=2,
	columns=fullflexible,
	escapechar=`,
	extendedchars=true,
	literate={á}{{\'a}}1 {č}{{\v{c}}}1 {ď}{{\v{d}}}1 {é}{{\'e}}1 {ě}{{\v{e}}}1 {è}{{\`{e}}}1 {í}{{\'{\i}}}1 {ľ}{{\v{l}}}1 {ň}{{\v{n}}}1 {ó}{{\'o}}1 {ŕ}{{\'r}}1 {ř}{{\v{r}}}1 {š}{{\v{s}}}1 {ť}{{\v{t}}}1 {ú}{{\'u}}1 {ů}{{\r{u}}}1 {ý}{{\'y}}1 {ž}{{\v{z}}}1
	{Á}{{\'A}}1 {Č}{{\v{C}}}1 {Ď}{{\v{D}}}1 {É}{{\'E}}1 {Ě}{{\v{E}}}1 {È}{{\`{E}}}1 {Í}{{\'I}}1 {Ľ}{{\v{L}}}1 {Ň}{{\v{N}}}1 {Ó}{{\'O}}1 {Ŕ}{{\'R}}1 {Ř}{{\v{R}}}1 {Š}{{\v{S}}}1 {Ť}{{\v{T}}}1 {Ú}{{\'U}}1 {Ů}{{\r{U}}}1 {Ý}{{\'Y}}1 {Ž}{{\v{Z}}}1
	{-}{{-}}1
}

\lstnewenvironment{code}[2]{%
	\lstset{style=FASThesisLstStyle}%
	\lstset{language=#1}%
	\lstset{caption={#2}}%
}{}

\lstnewenvironment{console}[1]{%
	\lstset{style=FASThesisConStyle}%
	\lstset{caption={#1}}%
	\global\let\FASThesis@lstlistingname\lstlistingname%
	\renewcommand{\lstlistingname}{\FASThesis@listing@label}%
}{%
	\renewcommand{\lstlistingname}{\FASThesis@lstlistingname}%
}

\newenvironment{important}{}{}
\ifx\FASThesis@style\c@fullcolor%
	\tcolorboxenvironment{important}{breakable, blanker,%
	text width=\textwidth - 8mm, left=4mm, before skip=.5\baselineskip, after skip=.75\baselineskip,%
	borderline west={1.5mm}{0pt}{FASThesis@ImportantColor}, borderline east={1.5mm}{-4mm}{FASThesis@ImportantColor}}%
\else%
	\tcolorboxenvironment{important}{breakable, blanker,%
	text width=\textwidth - 8mm, left=4mm, before skip=\baselineskip, after skip=.75\baselineskip,%
	borderline west={1.0mm}{0pt}{black}, borderline east={1.0mm}{-4mm}{black}}%
\fi%

% _____________________________________________________________________________
%
%        TESTING
%        *** This part should be removed in the release version ***
% _____________________________________________________________________________
%

% _____________________________________________________________________________
%
%        CLASS FILE EPILOGUE
% _____________________________________________________________________________
%

\makeatother
\endinput

% _____________________________________________________________________________
%
%        TODO
%
%        [ ] biber/biblatex má problémy se znakem \'{\i}
%
% _____________________________________________________________________________
