<!-- Transcripcion fiel via Gemini 2.5 Flash. Fuente: FORLand-2019-08.pdf. finishReason=STOP -->

ECONSTOR
Make Your Publications Visible.

A Service of
ZBW
Leibniz-Informationszentrum
Wirtschaft
Leibniz Information Centre
for Economics

Ritter, Matthias; Hüttel, Silke; Odening, Martin; Seifert, Stefan

Working Paper
Revisiting the relationship between land price and parcel
size

FORLand-Working Paper, No. 08 (2019)

Provided in Cooperation with:
DFG Research Unit 2569 FORLand "Agricultural Land Markets – Efficiency and Regulation",
Humboldt-Universität Berlin

Suggested Citation: Ritter, Matthias; Hüttel, Silke; Odening, Martin; Seifert, Stefan (2019) : Revisiting
the relationship between land price and parcel size, FORLand-Working Paper, No. 08 (2019),
Humboldt-Universität zu Berlin, DFG Research Unit 2569 FORLand "Agricultural Land Markets -
Efficiency and Regulation", Berlin,
https://doi.org/10.18452/19877

This Version is available at:
https://hdl.handle.net/10419/213062

## Standard-Nutzungsbedingungen:
Die Dokumente auf EconStor dürfen zu eigenen wissenschaftlichen
Zwecken und zum Privatgebrauch gespeichert und kopiert werden.

Sie dürfen die Dokumente nicht für öffentliche oder kommerzielle
Zwecke vervielfältigen, öffentlich ausstellen, öffentlich zugänglich
machen, vertreiben oder anderweitig nutzen.

Sofern die Verfasser die Dokumente unter Open-Content-Lizenzen
(insbesondere CC-Lizenzen) zur Verfügung gestellt haben sollten,
gelten abweichend von diesen Nutzungsbedingungen die in der dort
genannten Lizenz gewährten Nutzungsrechte.

## Terms of use:
Documents in EconStor may be saved and copied for your personal
and scholarly purposes.

You are not to copy documents for public or commercial purposes, to
exhibit the documents publicly, to make them publicly available on the
internet, or to distribute or otherwise use the documents in public.

If the documents have been made available under an Open Content
Licence (especially Creative Commons Licences), you may exercise
further usage rights as specified in the indicated licence.

CC BY NC ND
https://creativecommons.org/licenses/by-nc-nd/3.0/de/

WWW.ECONSTOR.EU
Mitglied der
Leibniz
Leibniz-Gemeinschaft

[Figura: Logos of BOKU, BONN, IAMO, Humboldt-Universität zu Berlin, and FORLand]

FORLAND
Agricultural Land Markets – Efficiency and Regulation

Revisiting the relationship between
land price and parcel size

Matthias Ritter, Silke Hüttel,
Martin Odening, Stefan Seifert

FORLand-Working Paper 08 (2019)

Published by
DFG Research Unit 2569 FORLand, Humboldt-Universität zu Berlin
Unter den Linden 6, D-10099 Berlin
https://www.forland.hu-berlin.de

CC BY NC ND

Tel +49 (30) 2093 46845, Email gabriele.wuerth@agrar.hu-berlin.de

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

## Abstract
## Revisiting the relationship between
## land price and parcel size

Matthias Ritter, Silke Hüttel, Martin Odening, Stefan Seifert

April 2019

Hedonic land price models often use parcel size as an explanatory variable. Empirical analyses,
however, are rather ambiguous regarding the direction and the size of the effect of this variable on
farmland values. The objective of this paper is to investigate this size-price relation in detail and to
derive recommendations for an appropriate specification of hedonic land price models. Our analysis
consists of three steps. First, we conduct a meta-analysis based on a comprehensive literature
review. Second, we analyze a dataset of more than 80,000 land transactions in Saxony-Anhalt,
Germany, using the non-parametric locally weighted scatterplot smoothing (LOWESS) estimator.
This unconditional smoothing algorithm identifies negative size-price relations for very small and
large plots, whereas it finds a positive relation for medium plot. We use this finding in our third step,
a hedonic land price model, in which the size-price relation is modelled conditional on land and
buyer characteristics. From these steps, we conclude that the complex relationship between land
price and plot size cannot be captured by a simple functional form since it is affected by several
economic factors, such as economies of size, transaction cost, and financial constraints.

**Keywords:** Land Prices, Parcel Size, Hedonic Model, LOWESS

**JEL codes:** C12, C14, Q11, Q24

**Acknowledgements:**

Financial support from the German Research Foundation (DFG) through Research Unit 2569
"Agricultural Land Markets – Efficiency and Regulation" (www.forland.hu-berlin.de) is gratefully
acknowledged. The authors thank the Gutachterausschuss für Grundstückswerte in Sachsen-
Anhalt for providing the data on farmland sales in Saxony-Anhalt. Moreover, we are grateful to Dong
Yin for his support in the meta-analysis and Gwen Schneider for her support in the LOWESS
estimation.

Matthias Ritter, Humboldt-Universität zu Berlin, Faculty of Life Sciences, Department of Agricultural
Economics, Quantitative Agricultural Economics, Unter den Linden 6, 10099 Berlin, Germany,
matthias.ritter@agrar.hu-berlin.de

FORLand-Working Paper 08 (2019) - 2 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

## 1 Introduction

Hedonic regression models are the most important workhorse for applied land price analyses.
Based on the seminal work by Rosen (1974), hedonic price models relate observed land prices
to land attributes and other factors that are conjectured to have an influence on land prices,
such as environmental variables or population density (Huang et al. 2006). Hedonic land price
models provide implicit prices for amenities, which are useful to appraise the value of a specific
land plot with given characteristics or to explain regional variation in land prices (Nickerson
and Zhang 2014). Moreover, hedonic regressions can be used to investigate the role of market
thinness in land markets and explore the role of participants, such as farmers compared to
non-farmers (Hüttel et al. 2016), as well as quantify their bargaining power (Coteleer et al.
2008; Kuethe and Bigelow 2018).

There is consensus in the literature about the direction of the impact of many land
characteristics that typically enter hedonic price models, such as soil quality and distance to
urban centers. This, however, is not true for another variable that is often used as a regressor
in land price models: the plot or parcel size. Not only the magnitude, but even the sign of the
plot size coefficient is ambiguous in various empirical studies.¹ This ambiguity of empirical
findings is rooted in the complex relationship of economic factors and the price that can be
measured as either a premium or as a discount for larger (or smaller) land parcels. Brorsen et
al. (2015) recently provide an explanation for the "small parcel size premium”. They argue that
the utility of certain types of land use, such as hobby farming or horse keeping, does not
proportionally increase with parcel size beyond a specific point. They also conjecture that
borrowing constraints and reduced competition – which is likely in illiquid farmland markets –
may explain reduced per-hectare prices of larger parcels. At the same time, economies of size
related to farm machinery and management, as well as partially fixed transaction costs in land
sales may justify price premia for larger plots.

A better understanding of the impact of parcel size on land prices is important for two reasons.
First, sizes of sold land plots have a huge variation, ranging from a few square meters to
several thousand hectares. Thus, a single estimated coefficient for the size-price relationship
that may be wrong would result in over- or underestimated values of plots with plot sizes far
from the mean. Moreover, a misspecification of the size-price relationship likely leads to biased
estimates of the coefficients of other model variables due to omitting relevant information.
Second, from a normative perspective, it would be useful to know for land sellers if a negative
price-parcel size relationship prevails on a land market. In that case, higher revenues could
be generated by splitting larger plots into smaller ones.

Against this background, our first objective is to take stock of the existing empirical knowledge
about the size-price relationship in agricultural land markets. To this end, we conduct a meta-
analysis based on a broad survey of empirical studies that implicitly or explicitly address the
size-price relationship. Our second objective is to examine several hypotheses on the size-
price relationship that have been discussed in the literature using a rich data set on land

¹ Details on the ambiguity of empirical results are presented in Section 2.

FORLand-Working Paper 08 (2019) - 3 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

transactions in Eastern Germany. We approach the latter objective in two steps. First, we
explore the functional relationship between land prices and parcel size by means of a data-
driven non-parametric approach. Next, we specify a parametric land price model that is able
to capture the stylized size-price relation indicated by the non-parametric model. Our model
specification allows for various interactions between the size variable and the moderator
variables, such as the type of land. We find that there is no simple size-price-relation, neither
linear nor quadratic, but that the impact of parcel size is case specific and varies with other
economic parameters.

## 2 A Meta-Analysis of the Size-Price Relationship

Through a comprehensive literature review, we collect studies that apply hedonic regressions
to explain farmland prices and include plot size as an explanatory variable. A requirement for
inclusion in the meta-analysis is that the exact specification of the regression model and the
estimation results, including parameter estimates and information on their reliability, have to
be provided in the study. We find 29 papers published between 1981 and 2019, with the
majority analyzing data from the U.S. (48%) and Europe (31%). The studies are based on very
different datasets, which can be seen by the average plot size in the studies ranging from 0.11
to 584.93 ha (see Table A1 in the appendix).

The regional variation and corresponding market differences make it difficult to compare the
studies. Additionally, different functional forms are applied in the models, so that the estimated
coefficients cannot be directly compared. Huang et al. (2006), for example, apply a log-log
model and obtain an estimated coefficient for the plot size of $\beta = -0.54$. This means that an
increase in the plot size by 1% decreases the price by 0.54%. In contrast, Yang et al. (2019),
model the logarithm of the price as a function of the linear plot size ($\beta = 0.0023$). Hence, an
absolute increase of the plot size by 1 ha increases the price per ha by 0.23%. To make the
results of different functional forms comparable, we convert the estimated coefficients into
elasticities. Contrary to marginal effects, elasticities are dimensionless allowing comparisons
across different currencies. One limitation that cannot be circumvented when comparing
different functional forms, however, is the fact that the elasticities are usually not constant for
varying plot size and/or price (except for the log-log model). We consider this by calculating
elasticities for the average plot size and average price of the corresponding study. Hence, we
obtain estimates at different points of the size-price relation, which needs to be kept in mind
when interpreting the results. The alternative, evaluating all elasticities at the same point (e.g.,
the mean over all studies), however, would require that the results of some studies are
extrapolated to a value far away from the study range for which the model was estimated. To
include information on the reliability of the estimated coefficients in the meta-analysis, the
standard errors of the coefficients are also converted into standard errors of the elasticities.
These determine weights of the single studies when calculating the overall effect in the meta-
analysis. If the standard errors of the estimated coefficients are not provided in the original
paper, we derive or approximate them based on the available information, such as the t-
statistic, p-value, or significance level. If several models are specified within a study, we take
the median of the elasticities. If there are an even number of models, the one with a smaller
standard error is chosen. Following Borenstein et al. (2011), we perform a meta-analysis with
random effects since the studies were conducted independently.

FORLand-Working Paper 08 (2019) - 4 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

The results of the meta-analysis are portrayed in a forest plot (Figure 1). The I² of 99.8%
indicates substantial heterogeneity between studies that cannot be explained by chance
(Higgins et al. 2003). The overall elasticity is -0.14, but the elasticities range from -0.52
(Huang et al. 2006) to +0.13 (Dahlvik 2017) and reflect the ambiguity of the results in the
empirical studies. As mentioned before, we must be careful with the interpretation since the
elasticities are calculated for different plot sizes. The average plot sizes for the lowest and
highest elasticities are 26.30 ha and 5.50 ha, respectively. These lie in the middle range of
elasticities and do not explain differences in plot size effects.

Figure 1: Results of the meta-analysis

[Figura: Forest plot showing elasticities and 95% CI for various studies, and an overall elasticity. The plot lists studies on the y-axis and Elasticity (95% CI) and % Weight on the x-axis. Most studies show negative elasticities, with a few showing positive ones. The overall elasticity is -0.14 (-0.18, -0.10).]

| Study ID                  | Elasticity (95% CI)   | % Weight |
| :------------------------ | :-------------------- | :------- |
| Huang et al. (2006)       | -0.52 (-0.55, -0.49)  | 4.09     |
| Latruffe et al. (2008)    | -0.49 (-0.75, -0.23)  | 1.51     |
| Sandrey et al. (1982)     | -0.48 (-0.55, -0.40)  | 3.65     |
| Tsoodle et al. (2007)     | -0.46 (-0.80, -0.11)  | 1.01     |
| Xu et al. (1993)          | -0.43 (-0.54, -0.33)  | 3.22     |
| Tsoodle et al. (2006)     | -0.34 (-0.35, -0.33)  | 4.20     |
| Hushak et al. (1979)      | -0.32 (-0.43, -0.20)  | 3.12     |
| Zhang et al. (2014)       | -0.29 (-0.30, -0.28)  | 4.20     |
| Chicoine (1981)           | -0.27 (-0.32, -0.22)  | 3.96     |
| Featherstone et al. (1993)| -0.19 (-0.20, -0.18)  | 4.19     |
| Troncoso et al. (2010)    | -0.17 (-0.34, -0.00)  | 2.44     |
| Barnard et al. (1997)     | -0.15 (-0.33, 0.03)   | 2.29     |
| Bastian et al. (2002)     | -0.13 (-0.19, -0.06)  | 3.80     |
| Palmquist and Danielson (1989) | -0.11 (-0.16, -0.07)  | 4.00     |
| Brorsen et al. (2015)     | -0.09 (-0.10, -0.07)  | 4.17     |
| Guiling et al. (2009)     | -0.07 (-0.43, 0.28)   | 0.97     |
| Maddison (2009)           | -0.07 (-0.09, -0.05)  | 4.16     |
| Choumert and Phélinas (2015) | -0.07 (-0.12, -0.01)  | 3.86     |
| Sengupta and Osgood (2003) | -0.04 (-0.04, -0.04)  | 4.20     |
| Pyykkönen (2006)          | -0.04 (-0.06, -0.03)  | 4.18     |
| Curtiss et al. (2013)     | -0.04 (-0.23, 0.14)   | 2.23     |
| Hüttel et al. (2014)      | -0.03 (-0.07, 0.01)   | 4.05     |
| Yang et al. (2019)        | 0.01 (0.00, 0.01)     | 4.21     |
| Myrna et al. (2019)       | 0.03 (0.03, 0.04)     | 4.20     |
| Lin and Evans (2000)      | 0.05 (0.01, 0.10)     | 3.97     |
| Maddison (2000)           | 0.06 (0.02, 0.10)     | 4.01     |
| Helbing et al. (2017)     | 0.07 (0.06, 0.08)     | 4.18     |
| Hüttel et al. (2013)      | 0.08 (-0.02, 0.18)    | 3.31     |
| Dahlvik (2017)            | 0.13 (-0.02, 0.29)    | 2.60     |
| Overall (I-squared = 99.8%, p = 0.000) | -0.14 (-0.18, -0.10) | 100.00   |

Most articles included in the meta-analysis do not focus on the impact of the plot size variable.
Nevertheless, this literature offers explicit hypotheses about the economic factors that underlie
the observed size-price relationship. To begin with, why should per unit land prices vary with
plot size at all? In fact, Parson (1990) argues that prices should be independent from size
since arbitrage profits would otherwise be possible by splitting larger plots into smaller ones
or vice versa. However, Maddison (2000) questions this “repackaging hypothesis” as it applies

FORLand-Working Paper 08 (2019) - 5 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

only to perfect markets. If transaction costs, including search and bargaining costs, are not
negligible, land cannot be repackaged costlessly. In turn, one may observe varying prices for
plots that are otherwise identical, but differ in size. Brorsen et al. (2015) provide an explanation
for why smaller plots sell at higher prices, i.e., include a premium. Their main idea is that
certain buyers acquire land for non-commercial purposes and the marginal utility of this type
of land use declines rapidly with plot size and can even become zero. Examples are horse
keeping for recreational purposes or “urban gardening”. As this kind of land use is more
frequently close to urban centers, Brorsen et al. (2015) use the distance to towns to test this
hypothesis. A further example of a non-agricultural land use that generates high returns for
small land plots is wind energy production (Ritter et al. 2015, Myrna et al. 2019). “Hobby
farming" or wind energy production may rationalize a negative size-price relationship, but this
explanation only holds for rather small land plots. In contrast, bargaining power and reduced
competition among potential buyers come into play if the volume of land transactions is large.
It is widely acknowledged that farmers, particularly small family farms, are financially
constrained (e.g., Zinych and Odening 2009). Thus, the number of bidders who can afford to
buy large land plots is naturally low. In turn, realized per hectare prices are often smaller
compared to medium sized plots. Empirical evidence for the positive relationship between the
number of bidders and land prices has recently been provided by Croonenbroeck et al. (2018)
in the context of land auctions in Eastern Germany. On the other hand, the labor productivity
of crop production decreases if land tracts are too small and fragmented (e.g., Latruffe and
Piet 2014). That is, economies of size cause a positive size-price relationship and the size of
this effect will clearly depend on the prevailing production technology. Another argument put
forward in favor of buying a large plot instead of several smaller ones are fixed transaction
costs, such as broker and notary costs, that do not vary proportionally with the plot size, but
vary with price.

To summarize, several economic forces related to plot size may exist that work in the same or
opposite direction. Which effect dominates depends on the particular market context. Thus, it
is not surprising that the sign and the magnitude of the parcel size differs in empirical studies
as shown in the meta-analysis. Another implication is that it is unlikely that the size-price
relationship can be captured by a single regression coefficient in a hedonic model, at least if
there is a large variation of parcel sizes in the sample. This calls for a flexible empirical
approach that allows for a variable size-price relationship. We illustrate the gains of such an
approach in the subsequent case study.

## 3 Case Study: Land Prices in Saxony-Anhalt

### 3.1 Study Region and Data

This case study deals with the German federal state of Saxony-Anhalt, located in Eastern
Germany. As with all federal states in the former German Democratic Republic, its land market
is characterized by expropriation and collectivization of land between 1949 and 1990. After
the German reunification, the Treuhandanstalt (1990–1992) and the Bodenverwertungs- und
verwaltungs GmbH (BVVG, since 1992) were in charge to privatize the state-owned land. The
privatization process is planned to be completed by 2030.

FORLand-Working Paper 08 (2019) - 6 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

The land market in Saxony-Anhalt experienced a strong price increase in the last decade,
which is typical for East German states. Prices for agricultural land in Saxony-Anhalt more
than tripled from 5,055 €/ha in 2007 to 17,903 €/ha in 2017, which lies above the average of
East German states, 15,626 €/ha, but is below the average for Germany, 24,064 €/ha
(Statistisches Bundesamt 2018).

The data applied in this study were provided by the Committee of Land Valuation Experts
(Gutachterausschuss für Grundstückswerte in Sachsen-Anhalt) and contain all transactions
in Saxony-Anhalt from 1994 to 2017. In addition to the price, the size, soil quality, location,
and type (arable land or grassland) of the transacted plot are included. Since 2011, information
about the buyer (farmer or non-farmer) are also available.

After adjusting for missing values, documentation mistakes, and unusual circumstances, such
as location in a wind farm or transactions among relatives, the dataset includes 82,650
observations. Table 1 depicts the descriptive statistics for the full sample and for the
subsample since 2011, which will be used later in a separate model. The average price is
8,700 €/ha for the full period and increases to 13,219 €/ha for the subsample after 2011. The
average size lies between 2 and 3 ha, but ranges between 1 m² and several hundred hectares.
The average soil quality is 64 points, which corresponds to a measure of the productivity of
soil at each site. The minimum soil quality value in our sample, 7, represents very low
productivity, whereas the highest value, 105, represents very high productivity. The highest
soil quality value obtained thus far in Germany is 120 (cf. Scheffer et al. 2010; BMJV 2007).
Only 9% of the sold plots are pure grassland and 10% are sold by the BVVG. After 2011, 27%
of the plots are bought by non-farmers. Interestingly, this share decreased over time from 37%
in 2011 to 22% in 2017.

Table 1: Descriptive statistics

|                   | Mean        | Std. Dev.   | Min      | Max       |
| :---------------- | :---------- | :---------- | :------- | :-------- |
| **Full sample (1994–2017, N=82,650)** |             |             |          |           |
| Price (€/ha)      | 8,700.73    | 12,572.69   | 100      | 958,700   |
| Size (ha)         | 2.56        | 8.22        | 0.0001   | 557.53    |
| Quality (index points) | 63.80       | 22.91       | 7        | 105       |
| Grassland (Dummy) | 0.09        | 0.29        | 0        | 1         |
| Seller BVVG (Dummy) | 0.10        | 0.29        | 0        | 1         |
| **Subsample (2011–2017, N=21,447)** |             |             |          |           |
| Price (€/ha)      | 13,219.78   | 9,169.50    | 200      | 433,300   |
| Size (ha)         | 2.94        | 8.13        | 0.0001   | 352.88    |
| Quality (index points) | 63.25       | 22.80       | 8        | 104       |
| Grassland (Dummy) | 0.08        | 0.28        | 0        | 1         |
| Seller BVVG (Dummy) | 0.11        | 0.31        | 0        | 1         |
| Buyer Non-Farmer (Dummy) | 0.27        | 0.44        | 0        | 1         |

FORLand-Working Paper 08 (2019) - 7 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

Figure 2: Density functions by plot size for farmers and non-farmers (shown for plot sizes less than 10 ha)

[Figura: Kernel density plot showing distribution of plot sizes for non-farmers and farmers. The x-axis is "Plot size (ha)" from 0 to 10, and the y-axis is "Density" from 0 to 1. The "Non-farmer" curve peaks at a smaller plot size and is narrower, while the "Farmer" curve is flatter and extends to larger plot sizes.]

A notable difference between farmers and non-farmers can be found in Figure 2, which depicts
the kernel density of the plot size for both groups. It turns out that non-farmers generally buy
smaller plots compared to farmers, namely, non-farmers have an average plot size of 1.71 ha
compared to 3.40 ha for farmers. This underpins the hypothesis of different land usages and
different marginal utility.

### 3.2 Non-Parametric Estimation

Due to the ambiguous results reported in the literature, no specific functional form is imposed
_a priori_ in our empirical study. To identify the appropriate specification, we proceed in two
steps. First, the underlying relationship is modelled non-parametrically and unconditionally by
a data-driven procedure. In a second step, a hedonic regression is specified using the
functional form motivated in the first step. The hedonic models also include price determinants
other than size.

Standard parametric estimation procedures can become inefficient not knowing the form of a
functional relationship. One possible way to model such a relationship without assumptions
about the parameterized family is a non-parametric modelling method, such as locally
weighted scatterplot smoothing (LOWESS). The LOWESS method (Cleveland 1979,
Cleveland and Devin 1988) follows the general idea that a complex functional relationship can
be approximated by separately fitting a low-degree polynomial for each point using a small

FORLand-Working Paper 08 (2019) - 8 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

neighborhood of data. The smoothed points are estimated with weighted least-squares,
weighting nearby points higher than remote ones. Each fitted value is calculated and then
plotted on the scatterplot. This does not result in parameter estimates or functional equations,
but rather in a visualization of the underlying functional relation.

The hyperparameters of the procedure, more precisely the degree of the polynomials and the
bandwidth, have to be determined beforehand. Choosing a polynomial of degree 0
corresponds to the procedure of moving average smoothing. To better approximate the
underlying functional relationship, a degree of 1, meaning a locally linear regression, can be
applied. Polynomials of degree 2, meaning a locally quadratic regression which is often
referred to as locally estimated scatterplot smoothing (LOESS), or higher degree-polynomials
are possible; however, they tend to overfit the data and make accurate computations more
difficult and complex (Cleveland 1979). Although only simple models are estimated, the
procedure is computationally intensive since a separate function is estimated for each
observation. The bandwidth determines the proportion of data used in each estimated
polynomial, defining which data points are considered neighbors. With a lower bandwidth, the
fitted curve lies closer to the specific patterns of the data points, but will have more variance
left. A higher bandwidth results in a smoother curve, possibly erasing important structure.

Figure 3: Result of the LOWESS estimation

[Figura: Scatter plot of smoothed price (€/ha) vs. plot size (ha) showing a non-linear relationship. The x-axis is "Plot size (ha)" from 0 to 600, and the y-axis is "Smoothed price (€/ha)" from 6000 to 16000. The curve shows a premium for very small plots, then an increase, and then a decline for very large plots.]

The result of the LOWESS estimation with linear polynomials and a bandwidth of 0.3 is
presented in Figure 3. It depicts the smoothed price for each observation in relation to the plot
size.² A clear non-linear shape becomes visible: Three distinct segments can be distinguished.
First, we find a small parcel size premium as reported in Brorsen (2012). However, this
premium applies only to very small plots below one hectare. Second, after a parcel size of

² To keep the results comparable, the logarithm of the price was used in the LOWESS smoothing as
it will be done in the parametric estimation. For a more intuitive representation, however, Figure 3
depicts the absolute land price. The log price shows the same pattern.

FORLand-Working Paper 08 (2019) - 9 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

about 1.3 ha, per hectare prices increase almost linearly with increasing size. Third, above
plot sizes of around 160 ha, prices drop significantly until a minimum price per hectare is
reached at a plot size of 558 ha. It should be noted that this segment of declining prices
consists of a comparably low number of transactions. Overall, the shape of the LOWESS
estimate is in line with the theoretical arguments presented in the previous section. They
suggest a negative slope of the size-price regression due to non-agricultural land uses for
small plots, followed by a positive slope due to economies of scale in crop production, and
finally followed by a negative slope because of liquidity constraints and reduced competition
among buyers.

The non-parametric estimation indicates that prices change non-linearly with respect to plot
size. However, even this non-linear relation could be moderated by economic factors, such as
land or buyer type. In the next section, we study the size-price relation conditional on other
price determining factors through a hedonic regression.

### 3.3 Parametric Estimation

#### 3.3.1 Model Specification

To assess the influence of the plot size on price, we control for other potential price-
determining factors based on the available dataset as described in Section 3.1. Hence, we
include soil quality in the model, as well as a dummy variable for grassland. Previous studies
on the land market in Eastern Germany report that prices are considerably higher if the plot is
sold by the BVVG, presumably due to a better composition or sales via public tenders (e.g.,
Hüttel et al. 2016). Thus, we also add a dummy variable for plots sold by the BVVG. Dummy
variables are included as location classes to control for time-constant, spatial differences. The
twelve classes are generated by expert committees (Gutachterausschüsse) by merging
comparable location value zones (Bodenrichtwertzonen). Hence, these classes can reflect
spatial heterogeneity better than rather arbitrary administrative regions, such as counties. To
capture other temporal influences that are constant over space, dummy variables for each
year are included. Finally, we model the logarithm of the price according to the following
equation:

$$
\log P_i = \beta_0 + f (A_i) + \beta_1Q_i + \beta_2D_{grassland} + \beta_3D_{non-farmer} + \beta_4D_{BVVG} \\
+ \sum_{k=2}^{11} \gamma_k D_k^{LK} + \sum_{k=1995}^{2017} \delta_k D_k^{Year} + u_i, \quad (1)
$$

where $P_i$ is the price per ha, $f (A_i)$ denotes a function of the plot size as specified below, $Q_i$ is
the soil quality, and $D_{grassland}$ denotes a dummy variable for grassland with arable land as the
reference category. For the model using the subsample since 2011, $D_{non-farmer}$ denotes a
dummy variable indicating if a farmer (0) or non-farmer (1) bought the plot. The dummy
variable $D_{BVVG}$ denotes whether the plot was sold by the BVVG (1) or not (0). $D_k^{LK}$ and $D_k^{Year}$
are dummy variables referring to the location class and the year of transaction, respectively.
The dummy variables for the first location class and the first year of the study period are
dropped and represent the reference. Finally, $u_i$ denotes the error term.

FORLand-Working Paper 08 (2019) - 10 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

To capture the impact of the plot size, $f (A_i)$, we use a parametric function that is more flexible
compared to most previous studies. It reflects the shape we found with the unconditional
LOWESS estimate and allows us to test economic hypotheses. This functional form consists
of an inverse part that allows for a premium for small plots, a linear part that reflects increasing
value due to economies of scale, and a quadratic part that can dampen the positive effect and
turn it into a negative one (see Eq. (2)). The following inverse-linear-quadratic function has the
advantage of allowing us to test the aforementioned hypotheses:³

Model 1:
$$
f(A_i) = a_1A_i^{-1} + a_2A_i + a_3A_i^2. \quad (2)
$$

In Model 2, we allow the function to differ for arable land and grassland. Hence, Eq. (3) extends
Eq. (2) by including interactions with the dummy variable $D_{grassland}$:

Model 2:
$$
f(A_i) = (b_1 + b_2D_{grassland}) A_i^{-1} + (b_3 + b_4D_{grassland}) A_i + (b_5 + b_6D_{grassland}) A_i^2. \quad (3)
$$

In Model 3, we only consider observations from 2011 onwards, for which we have information
about whether the buyer of the plot is a farmer. Here, the function is extended by interactions
with the dummy variable $D_{non-farmer}$ (see Eq. 4)) to allow for differences in the size-price
relation between these groups.

Model 3:
$$
f(A_i) = (C_1 + C_2D_{grassland} + C_3D_{non-farmer}) A_i^{-1} + (C_4 + C_5D_{grassland} + C_6D_{non-farmer}) A_i + (C_7 + C_8D_{grassland} + C_9D_{non-farmer}) A_i^2. \quad (4)
$$

#### 3.3.2 Results

The models are estimated with ordinary least squares regression techniques with
heteroscedasticity-consistent standard errors. The results in Table 2 show expected results for
the classic variables: Soil quality has a positive effect in all models. An increase in soil quality
by one index point leads to a 1% higher price while holding all other variables constant. Prices
for grassland are, by nature, considerably lower compared to those for arable land with
grassland prices being about 25% lower over the whole period and 45% lower since 2011.
The BVVG as a seller achieves a price that is 28% higher for the whole period and 41% higher
since 2011. This relates to the aforementioned reason of the BVVG selling at first price
auctions with public tenders. Moreover, significant differences over the years are found, which
reflect the strong price increase in the last decade (see Figure 4). Finally, location classes
capture spatial heterogeneity of land prices.

³ An alternative functional form capturing this pattern is a cubic polynomial as Maddison (2000) uses
for the plot-size effect for farmland values in the UK.

FORLand-Working Paper 08 (2019) - 11 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

Table 2: Estimation results

| Variable                  | Model 1                               | Model 2                               | Model 3                               |
| :------------------------ | :------------------------------------ | :------------------------------------ | :------------------------------------ |
|                           | Coef.                 | Std. Err.             | Coef.                 | Std. Err.             | Coef.                 | Std. Err.             |
| Size (inv.)               | 0.000140 ***          | 0.000019              | 0.000136 ***          | 0.000019              | -0.000326             | 0.000460              |
| Size (inv.) x Grassland   |                       |                       | 0.000119 ***          | 0.000084              | 0.000223              | 0.000144              |
| Size (inv.) x Non-farmer  |                       |                       |                       |                       | 0.000331              | 0.000461              |
| Size (lin.)               | 0.000945 ***          | 0.000333              | 0.001301 ***          | 0.000337              | 0.011545 ***          | 0.001208              |
| Size (lin.) x Grassland   |                       |                       | -0.010528 ***         | 0.001918              | -0.009748 **          | 0.004934              |
| Size (lin.) x Non-farmer  |                       |                       |                       |                       | 0.003864              | 0.002846              |
| Size (squ.)               | -0.000002 ***         | 0.000001              | -0.000003 **          | 0.000001              | -0.000045 ***         | 0.000016              |
| Size (squ.) x Grassland   |                       |                       | 0.000070 ***          | 0.000020              | 0.000003              | 0.000062              |
| Size (squ.) x Non-farmer  |                       |                       |                       |                       | -0.000016             | 0.000020              |
| Quality                   | 0.010541 ***          | 0.000089              | 0.010538 ***          | 0.000089              | 0.011983 ***          | 0.000152              |
| Grassland (D)             | -0.272861 ***         | 0.006524              | -0.258011 ***         | 0.007519              | -0.450615 ***         | 0.016383              |
| BVVG (D)                  | 0.281708 ***          | 0.005553              | 0.282189 ***          | 0.005549              | 0.413710 ***          | 0.010108              |
| Buyer Non-farmer (D)      |                       |                       |                       |                       | -0.037228 ***         | 0.008773              |
| Constant                  | 8.130115 ***          | 0.037687              | 8.129575 ***          | 0.037700              | 8.381918 ***          | 0.044985              |
| **Time**                  |                       |                       |                       |                       |                       |                       |
| (see Fig. 4)              |                       |                       |                       |                       |                       |                       |
| **Location**              |                       |                       |                       |                       |                       |                       |
| 2                         | 0.155899 ***          | 0.034039              | 0.155290 ***          | 0.034053              | 0.146049 ***          | 0.045308              |
| 3                         | -0.002719             | 0.033724              | -0.003100             | 0.033737              | -0.025492             | 0.044635              |
| 4                         | -0.053073             | 0.033519              | -0.053088             | 0.033532              | -0.047370             | 0.043979              |
| 5                         | -0.152984 ***         | 0.033509              | -0.153079 ***         | 0.033522              | -0.211690 ***         | 0.044117              |
| 6                         | -0.170640 ***         | 0.033467              | -0.170589 ***         | 0.033480              | -0.218278 ***         | 0.043942              |
| 7                         | -0.272387 ***         | 0.033855              | -0.272053 ***         | 0.033868              | -0.338655 ***         | 0.044522              |
| 8                         | -0.304883 ***         | 0.033707              | -0.304629 ***         | 0.033719              | -0.453918 ***         | 0.044443              |
| 9                         | -0.454644 ***         | 0.033796              | -0.454048 ***         | 0.033809              | -0.620111 ***         | 0.044675              |
| 10                        | -0.438536 ***         | 0.039934              | -0.438858 ***         | 0.039946              | -0.636592 ***         | 0.050975              |
| 11                        | -0.603556 ***         | 0.036364              | -0.603702 ***         | 0.036375              | -0.759984 ***         | 0.046763              |
| N                         | 82,650                |                       | 82,650                |                       | 21,447                |                       |
| R²                        | 0.5271                |                       | 0.5273                |                       | 0.6410                |                       |

Note: ** and *** denote statistical significance at the 5% and 1% significance level.

In this study, the influence of plot size variables is of particular interest. In Model 1, the inverse
and the linear term have the expected positive signs and are statistically significant at the 1%
level. This confirms the existence of a price premium for very small plots and a linear increase
in prices for intermediate plot sizes. Table 3 reports the results of a Wald test, which clearly
rejects the null hypothesis of no inverse and no quadratic term (p < 0.0001). Thus, the model
is significantly better than modelling the influence of the plot size only linearly.

Model 2 analyzes the size-price relationship further and allows for different functions for arable
land and grassland (see Eq. (3)). The results suggest the presence of a small-size premium,
though this premium is different for arable land and grassland. For arable land, the linear and
quadratic terms are statistically significant and have the expected positive and negative sign,
respectively. These terms, however, differ considerably for grassland, which has a negative
linear and a positive quadratic relation. These findings reveal that the functional form is
significantly different when prices of grassland are analyzed. A Wald test rejects the null
hypothesis of an equal size impact for arable land and grassland (p < 0.0001).

FORLand-Working Paper 08 (2019) - 12 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

Figure 4: Estimated multiplicative time effects and confidence intervals

[Figura: Line plot showing estimated time effects and confidence intervals for Models 1, 2, and 3 over the years 1994-2017. The x-axis represents years from 1994 to 2017, and the y-axis is "Estimates of time effect" from 0.5 to 2.0. All models show a relatively stable effect until around 2007-2008, after which the time effect increases significantly.]

Note: The effects are shown as exponential of the estimated coefficients. For Models 1 and 2, they are
normalized to the reference year 2011.

Model 3 is estimated based on the subsample of data from 2011 to 2017 since information on
the buyer group is only available for this period. The results show that the inverse terms lost
their statistical significance, individually and jointly (p = 0.4125), indicating that the small size
premium has vanished in recent years. The linear and quadratic terms still play a role and the
significant difference between the size-price functions for arable land and grassland remains
(p < 0.0001). The functional forms between farmers and non-farmers do not differ significantly
(p = 0.4393), but the dummy variable for non-farmer buyers is statistically significant and
negative. Including this dummy variable in the test, the difference between farmers and non-
farmers is confirmed (p = 0.0005).

Since plot size enters the hedonic model in a nonlinear function and via several interaction
terms, it is hard to depict the overall effect of this variable. To illustrate the results of Model 3,
Figure 5 portrays the average price dependent on plot size for arable land and grassland, as
well as for farmers and non-farmers with the other variables held constant at their means. Note
that all parameter estimates enter the calculation irrespective of their significance. It turns out
that prices for arable land increase linearly for both groups until the maximum price per hectare
is reached at about 130 ha. Non-farmers pay up to 5,000 €/ha more compared to farmers.
After the maximum, per hectare prices decline considerably, indicating the aforementioned
liquidity constraints. For grassland, where we have much lower plot sizes, there is little
difference between farmers and non-farmers.

FORLand-Working Paper 08 (2019) - 13 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

Table 3: Wald test results for the functional form of plot size

| Model | Hypothesis                                    | $H_0$                                 | Test statistic          | p-value    |
| :---- | :-------------------------------------------- | :------------------------------------ | :---------------------- | :--------- |
| 1     | Linear model better                           | $a_1 = a_3 = 0$                       | $F(2,82610) = 28.94$    | $p < 0.0001$ |
| 2     | No difference between arable land and grassland | $b_2 = b_4 = b_6 = 0$                 | $F(3,82607) = 13.56$    | $p < 0.0001$ |
| 3     | No influence of size                          | $c_1 = \dots = c_9 = 0$               | $F(3,21417) = 43.01$    | $p < 0.0001$ |
|       | No difference between arable land and grassland | $c_2 = c_5 = c_8 = 0$                 | $F(3,21417) = 26.40$    | $p < 0.0001$ |
|       | No difference between farmer and non-farmer   | $c_3 = c_6 = c_9 = 0$                 | $F(3,21417) = 0.91$     | $p = 0.4375$ |
|       | No difference between farmer and non-farmer (including level) | $\beta_3 = c_3 = c_6 = c_9 = 0$       | $F(4,21417) = 4.98$     | $p = 0.0005$ |
|       | No inverse relation                           | $c_1 = c_2 = c_3 = 0$                 | $F(3,21417) = 0.96$     | $p = 0.4126$ |
|       | No linear relation                            | $c_4 = c_5 = c_6 = 0$                 | $F(3,21417) = 41.37$    | $p < 0.0001$ |
|       | No squared relation                           | $c_7 = c_8 = c_9 = 0$                 | $F(3,21417) = 10.73$    | $p < 0.0001$ |

Figure 5: Results of the parametric estimation (arable land vs. grassland, farmer vs. non-farmer), 2011–2017

[Figura: Line plot showing price based on mean values (€/ha) vs. plot size (ha) for farmer arable land, farmer grassland, non-farmer arable land, and non-farmer grassland. The x-axis is "Plot size (ha)" from 0 to 400, and the y-axis is "Price based on mean values (€/ha)" from 0 to 30000. Non-farmer arable land shows the highest prices, peaking around 130 ha, then declining. Farmer arable land follows a similar pattern but at lower prices. Grassland prices are much lower and show less variation with plot size.]

Note: The lines are plotted for the range of the plot size in the observation period for the different groups.

FORLand-Working Paper 08 (2019) - 14 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

## 4 Conclusions

In contrast to other financial assets, land is traded on illiquid markets and sales are associated
with significant search and transactions costs. As a result, it cannot be expected that the price
per unit of land is independent of the transaction volume. In fact, most hedonic regression
models contain parcel size as an explanatory variable for the per unit price of agricultural land.
A meta-analysis of 29 studies reveals that the effect of parcel size varies not only among
studies, but may even change within a study. In other words, there is no simple and
unambiguous size-price relationship. This is not surprising since various economic factors
exist that can either cause a negative or a positive effect of plot size. Moreover, _a priori_ it is
not clear which factors dominate in a particular empirical context. We conclude that a simple
linear or log-linear relationship, which is often assumed in empirical applications, cannot
adequately capture the complex size-price relation.

In a case study based on a comprehensive data set of more than 80,000 land transactions,
we identify a general pattern that consists of three different segments: a negative effect of plot
size for small parcels, followed by a positive relation for medium sizes, and a negative effect
for very large sizes. Accordingly, we suggest a polynomial for the plot size variable in hedonic
price models, which is composed of an inverse term, a linear term, and a quadratic term. The
suggestion for this functional form was based on a non-parametric LOWESS estimation that
constitutes an alternative to the common Box-Cox procedure. Another insight from our
analysis is that the size-price relationship may vary over time and differ for subsamples. More
specifically, we find different effects of plot size for arable land and grassland, as well as for
farmers and non-farmers. Two modelling strategies might cope with this complexity. One could
either focus on homogeneous subsamples or include moderator variables and interaction
terms that allow for variable size-price relations.

Finally, our case study reveals that unobserved heterogeneity and omitted variable bias may
be an issue in hedonic land price models, as already emphasized by Nickerson and Zhang
(2014). For example, we found that the BVVG sold small land plots via first price sealed bid
auctions at a price premium between 2007 and 2010. This premium, however, may not solely
be related to the plot size and may also be due to the competitiveness of the auction
mechanism and the low search cost of this institutional seller in the market. If information about
the seller is missing from the sample, this seller effect might have been erroneously interpreted
as a small parcel size premium.

The results of our study have several practical implications. First, our two-step estimation
approach can be applied to the estimation of locational values that are regularly conducted by
valuation experts to inform land markets participants about "average” farmland values (cf.
Helbing et al. 2017). For the calculation of these location values, the impact of land amenities,
such as plot size, has to be explicitly considered and our analysis may serve as a guideline.
Second, from a normative perspective, our findings may offer a rationale for considering multi-
tract auctions to sell very large properties up to whole farms. These properties could be divided
into multiple bidding units to reflect potential fragmented use. Potential purchasers could
submit bids on individual tracts, combinations of tracts, and/or on the whole property. Offering
property under the multi-tract auction system could attract more solvent bidders and bidders
would be able to directly reveal their willingness to pay for larger non-fragmented plots.

FORLand-Working Paper 08 (2019) - 15 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

## References

Barnard, C.H., Whittaker, G., Westenbarger, D., Ahearn, M. (1997): Evidence of capitalization of
direct government payments into US cropland values. American Journal of Agricultural
Economics 79(5): 1642–1650.

Bastian, C.T., McLeod, D.M., Germino, M.J., Reiners, W.A., Blasko, B.J. (2002): Environmental
amenities and agricultural land values: a hedonic model using geographic information systems
data. Ecological economics 40(3): 337-349.

BMJV (2007): Gesetz zur Schätzung des Landwirtschaftlichen Kulturbodens
(Bodenschätzungsgesetz–BodSchätzG). Bundesministerium der Justiz und für
Verbraucherschutz. https://www.gesetze-im-internet.de/bodsch_tzg_2008/BJNR317600007.html
(accessed on 29 January 2019).

Borenstein, M., Hedges, L.V., Place, F., Quiggin, J. (2011): Introduction to Meta-Analysis. John Wiley
& Sons.

Brorsen, B.W., Doye, D., Neal, K.B. (2015): Agricultural land and the small parcel size premium
puzzle. Land Economics 91(3): 572–585.

Chicoine, D.L. (1981): Farmland values at the urban fringe: an analysis of sale prices. Land
Economics 57(3): 353–362.

Choumert, J., Phélinas, P. (2015): Determinants of agricultural land values in Argentina. Ecological
Economics 110, 134–140.

Cleveland, W.S. (1979): Robust locally weighted regression and smoothing scatterplots. Journal of
the American Statistical Association 74(368): 829–836.

Cleveland, W.S., Devlin, S.J. (1988): Locally weighted regression: an approach to regression analysis
by local fitting. Journal of the American Statistical Association 83(403): 596–610.

Cotteleer, G. (2008): Valuation of land use in the Netherlands and British Columbia: a spatial hedonic
GIS-based approach.

Croonenbroeck, C., Odening, M., Hüttel, S. (2018): Farmland Values and Bidder Behavior in First-
Price Land Auctions. FORLand-Working Paper 02(2018).

Curtiss, J., Jelínek, L., Medonos, T., Vilhelm, V.Ã. (2013): The effect of heterogeneous buyers on
agricultural land prices: the case of the Czech land market. Journal of International Agricultural
Trade and Development 62(2).

Dahlvik, M. (2017): Determinants of agricultural land prices in Ostrobothnia Finland. 1401-4084.

Featherstone, A.M., Schurle, B.W., Duncan, S.S., Postier, K.D. (1993): Clearance sales in the
farmland market? Journal of Agricultural and Resource Economics, 160–174.

Guiling, P., Brorsen, B.W., Doye, D. (2009): Effect of urban proximity on agricultural land values. Land
Economics 85(2): 252–264.

Guiling, P., Doye, D., Brorsen, B.W. (2009): Agricultural, recreational and urban influences on
agricultural land prices. Agricultural Finance Review 69(2): 196–205.

Helbing, G., Shen, Z., Odening, M., Ritter, M. (2017): Estimating location values of agricultural land.
German Journal of Agricultural Economics 66(3): 188–201.

Higgins, J. P., Thompson, S. G., Deeks, J. J., Altman, D. G. (2003): Measuring inconsistency in meta-
analyses. BMJ: British Medical Journal 327(7414): 557.

Huang, H., Miller, G.Y., Sherrick, B.J., Gomez, M.I. (2006): Factors influencing Illinois farmland
values. American Journal of Agricultural Economics 88(2): 458–470.

Hushak, L.J., Sadr, K. (1979): A spatial model of land market behavior. American Journal of
Agricultural Economics 61(4): 697–702.

Hüttel, S., Jetzinger, S., Odening, M. (2014): Forced Sales and Farmland Prices. Land Economics
90(3): 395–410.

Hüttel, S., Odening, M., Kataria, K., Balmann, A. (2013): Price Formation on Land Market Auctions in
East Germany–An Empirical Analysis Auktionspreise auf dem ostdeutschen Bodenmarkt–eine
empirische Analyse. German Journal of Agricultural Economics 62(2): 99–115.

Hüttel, S., Wildermann, L., Croonenbroeck, C. (2016): How do institutional market players matter in
farmland pricing? Land Use Policy 59, 154–167.

Kuethe, T.H., Bigelow, D.P. (2018): Bargaining Power in Farmland Rental Markets. Selected Paper
prepared for presentation at the 2018 Agricultural Applied Economics Association Annual
Meeting, Washington, D.C., August 5–August 7.

FORLand-Working Paper 08 (2019) - 16 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

Latruffe, L., Doucha, T., Le Mouël, C., Medonos, T., Voltr, V. (2008): Capitalisation of the government
support in agricultural land prices in the Czech Republic. Agricultural Economics-Czech 54(10):
451–460.

Latruffe, L., Piet, L. (2014): Does land fragmentation affect farm performance? A case study from
Brittany, France. Agricultural Systems 129, 68–80.

Lin, T.-C., Evans, A.W. (2000): The relationship between the price of land and size of plot when plots
are small. Land Economics, 386–394.

Maddison, D. (2000): A hedonic analysis of agricultural land prices in England and Wales. European
Review of Agricultural Economics 27(4): 519–532.

Maddison, D. (2009): A Spatio-temporal Model of Farmland Values. Journal of Agricultural Economics
60(1): 171–189.

Myrna, O., Odening, M., Ritter, M. (2019): The influence of wind energy and biogas on farmland
prices. Land 8(1).

Nickerson, C., Zhang, W. (2014): Modeling the determinants of farmland values in the United States.
The Oxford Handbook of Land Economics, 111.

Palmquist, R.B., Danielson, L.E. (1989): A hedonic study of the effects of erosion control and
drainage on farmland values. American Journal of Agricultural Economics 71(1): 55–62.

Parsons, G.R. (1990): Hedonic prices and public goods: an argument for weighting locational
attributes in hedonic regressions by lot size. Journal of Urban Economics 27 (3): 308–321.

Pyykkönen, P. (2006): Factors affecting farmland prices in Finland. Pellervo Economic Research
Institute, Publication No. 19, Helsinki. http://urn.fi/URN:ISBN:952-5594-17-3.

Ritter, M., Hüttel, S., Walter, M., Odening, M. (2015): Der Einfluss von Windkraftanlagen auf
landwirtschaftliche Bodenpreise (de). 1,72 MB / Berichte über Landwirtschaft - Zeitschrift für
Agrarpolitik und Landwirtschaft, Band 93, Heft 3, Dezember 2015.

Rosen, S. (1974): Hedonic prices and implicit markets: product differentiation in pure competition.
Journal of Political Economy 82(1): 34–55.

Sandrey, R.A., Arthur, L.M., Oliveira, R.A., Wilson, W.R. (1982): Determinants of Oregon Farmland
Values: A Pooled Cross-Sectional, Time Series Analysis. Western Journal of Agricultural
Economics, 211–220.

Scheffer, F., Schachtschabel, P., Blume, H.-P., Brümmer, G. W., Horn, R., Kandeler, E., et al. (2010):
Lehrbuch der Bodenkunde. 16. Auflage. Heidelberg: Spektrum Akademischer Verlag.

Sengupta, S., Osgood, D.E. (2003): The value of remoteness: a hedonic estimation of ranchette
prices. Ecological Economics 44(1): 91–103.

Statistisches Bundesamt (2018): Land- und Forstwirtschaft, Fischerei: Kaufwerte für landwirtschaft-
liche Grundstücke 2017.
https://www.destatis.de/DE/Publikationen/Thematisch/Preise/Baupreise/KaufwerteLandwirtschaft
licheGrundstuecke.html

Troncoso, J.L., Aguirre, M., Manriquez, P., Labarra, V., Ormazábal, Y. (2010): The influence of
physical attributes on the price of land: the case of the province of Talca, Chile. Ciencia e
investigación agraria 37(3): 105–112.

Tsoodle, L.J., Featherstone, A.M., Golden, B.B. (2007): Combining hedonic and negative exponential
techniques to estimate the market value of land. Agricultural Finance Review 67 (2): 225–239.

Tsoodle, L.J., Golden, B.B., Featherstone, A.M. (2006): Factors influencing Kansas agricultural farm
land values. Land Economics 82(1): 124–139.

Xu, F., Mittelhammer, R.C., Barkley, P.W. (1993): Measuring the contributions of site characteristics
to the value of agricultural land. Land Economics 69(4): 356.

Yang, X., Odening, M., Ritter, M. (2019): The Spatial and Temporal Diffusion of Agricultural Land
Prices. Land Economics 95(1): 108–123.

Zhang, W., Ward, B., Irwin, E.G. (2014): The Trends and Determinants of Farmland Sale Prices in
Western Ohio 2001-2010. Ohio State University Extension Bulletin.

Zinych, N., Odening, M. (2009): Capital market imperfections in economic transition: empirical
evidence from Ukrainian agriculture. Agricultural Economics 40(6): 677–689.

FORLand-Working Paper 08 (2019) - 17 -

Matthias Ritter; Silke Hüttel; Martin Odening; Stefan Seifert
Revisiting the relationship between land price and parcel size

## Appendix

Table A1: Descriptive statistics of the references used in the meta-analysis (sorted by average plot size)

| Reference                       | Avg. plot size (ha) | Country        |
| :------------------------------ | :------------------ | :------------- |
| Lin and Evans (2000)            | 0.11                | Taiwan         |
| Latruffe et al. (2008)          | 0.60                | Czech Republic |
| Yang et al. (2019)              | 2.30                | Germany        |
| Curtiss et al. (2013)           | 2.60                | Czech Republic |
| Sengupta and Osgood (2003)      | 4.10 & 0.04¹        | USA            |
| Myrna et al. (2019)             | 2.96                | Germany        |
| Hüttel et al. (2014)            | 5.13                | Germany        |
| Dahlvik (2017)                  | 5.50                | Finland        |
| Hüttel et al. (2013)            | 6.39 & 0.67²        | Germany        |
| Pyykkönen (2006)                | 6.40                | Finland        |
| Helbing et al. (2017)           | 8.89                | Germany        |
| Zhang et al. (2014)             | 19.36               | USA            |
| Huang et al. (2006)             | 26.30               | USA            |
| Maddison (2009)                 | 33.99               | UK             |
| Palmquist and Danielson (1989)  | 40.59               | USA            |
| Maddison (2000)                 | 52.64               | UK             |
| Tsoodle et al. (2007)           | 65.56               | USA            |
| Brorsen et al. (2015)           | 68.80               | USA            |
| Tsoodle et al. (2006)           | 68.90               | USA            |
| Featherstone et al. (1993)      | 80.94               | USA            |
| Xu et al. (1993)                | 90.84 ³             | USA            |
| Hushak et al. (1979)            | 90.84 ³             | USA            |
| Chicoine (1981)                 | 90.84 ³             | USA            |
| Sandrey et al. (1982)           | 90.84 ³             | USA            |
| Barnard et al. (1997)           | 90.84 ³             | USA            |
| Guiling et al. (2009)           | 93.37               | USA            |
| Choumert and Phélinas (2015)    | 148.60              | Argentina      |
| Troncoso et al. (2010)          | 148.60 ³            | Chile          |
| Bastian et al. (2002)           | 584.93              | USA            |

Notes: ¹ The authors divide the observations in two groups according to the plot size (smaller and larger
than 0.8094 ha). ² The authors differentiate between arable land (average plot size of 6.39 ha) and
grassland (average plot size of 0.67). ³ In these articles, the average plot size is not provided, so we
replace it by the continent average.

FORLand-Working Paper 08 (2019) - 18 -