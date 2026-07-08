<!-- Transcripcion fiel via Gemini 2.5 Flash. Fuente: pp2.pdf. finishReason=STOP -->

WILEY-BLACKWELL
American Finance Association

Empirical Testing of Real Option-Pricing Models
Author(s): Laura Quigg
Source: The Journal of Finance, Vol. 48, No. 2 (Jun., 1993), pp. 621-640
Published by: Blackwell Publishing for the American Finance Association
Stable URL: http://www.jstor.org/stable/2328915
Accessed: 09/03/2009 07:09

Your use of the JSTOR archive indicates your acceptance of JSTOR's Terms and Conditions of Use, available at
http://www.jstor.org/page/info/about/policies/terms.jsp. JSTOR's Terms and Conditions of Use provides, in part, that unless
you have obtained prior permission, you may not download an entire issue of a journal or multiple copies of articles, and you
may use content in the JSTOR archive only for your personal, non-commercial use.

Please contact the publisher regarding any further use of this work. Publisher contact information may be obtained at
http://www.jstor.org/action/showPublisher?publisherCode=black.

Each copy of any part of a JSTOR transmission must contain the same copyright notice that appears on the screen or printed
page of such transmission.

JSTOR is a not-for-profit organization founded in 1995 to build trusted digital archives for scholarship. We work with the
scholarly community to preserve their work and the materials they rely upon, and to build a common research platform that
promotes the discovery and use of these resources. For more information about JSTOR, please contact support@jstor.org.

Blackwell Publishing and American Finance Association are collaborating with JSTOR to digitize, preserve
and extend access to The Journal of Finance.
JSTOR
http://www.jstor.org

THE JOURNAL OF FINANCE • VOL. XLVIII, NO. 2 • JUNE 1993

Empirical Testing of Real
Option-Pricing Models

LAURA QUIGG*

ABSTRACT
This research is the first to examine the empirical predictions of a real option-pric-
ing model using a large sample of market prices. We find empirical support for a
model that incorporates the option to wait to develop land. The option model has
explanatory power for predicting transactions prices over and above the intrinsic
value. Market prices reflect a premium for the option to wait to invest that has a
mean value of 6% in our sample. We also estimate implied standard deviations for
individual commercial property prices ranging from 18 to 28% per year.

DESPITE EXTENSIVE TESTING OF option-pricing models for financial assets,
virtually no research has addressed the empirical implications of option-based
valuation models for real assets.¹ This research is the first effort that
examines the empirical predictions of a real option-pricing model using a
large sample of market prices. Real options that have been valued in the
academic literature include capital investments and natural resources, as
well as urban land. The model we consider incorporates the option to wait to
invest in the valuation of urban land. This paper provides empirical informa-
tion about the option-based value of land, relative to its intrinsic value and
its market price.
Using data on 2700 land transactions in Seattle, we find a mean option
(time) premium of 6% of the theoretical land value. This premium ranges
from 1% to 30% in various subsamples. We define the "option premium" as
the difference between the intrinsic value and the option model value, divided
by the option model value. We also find that the option model has explana-

* Department of Finance, University of Illinois at Urbana-Champaign. The author thanks
Peter Berck, Peter Colwell, Robert Edelstein, Bjorn Flesaker, Steven Grenadier, Hayne Leland,
Jay Ritter, Anthony Sanders, René Stulz, Sheridan Titman, Nancy Wallace, Joseph Williams,
and seminar participants at the University of Illinois, the 1992 Western Finance Association
Meetings, and the Norwegian School of Management, and two anonymous referees for useful
comments.
¹ The exception is the Paddock, Siegel, and Smith (1988) empirical study discussed below.
Theoretical real option-pricing models include Titman (1985), Brennan and Schwartz (1985),
McDonald and Siegel (1985, 1986), Majd and Pindyck (1987), Morck, Schwartz, and Stangeland
(1989), Brennan (1990), Gibson and Schwartz (1990), Triantis and Hodder (1990), and Williams
(1991a).
² The mean of 6% is an unweighted average across all sample observations.

621

622
The Journal of Finance

tory power over and above the intrinsic value for predicting transaction
prices. Therefore, to the extent that it is possible to coordinate and time an
investment, valuation models should account for the option to wait. We
believe that the premia for more speculative properties might be much larger
than the values given here.³
In addition, we estimate implied standard deviations of individual commer-
cial real estate asset prices in the range of 18 to 28% per year. This result is a
contribution in itself, as a lack of repeat sales data for this class of assets
makes it difficult to estimate the price variance directly. The implied vari-
ances we estimate are equivalent to Black-Scholes implied volatilities from
stock options.
Previous research that evaluates the prices obtained from a real option
model is limited to Paddock, Siegel, and Smith (1988). Paddock et al. develop
an option-based model that values offshore petroleum leases as a function of
the market price of oil. For 21 tracts, they compare the prices computed from
this model both to the government's discounted cash flow model (which uses
the same underlying data inputs) and to industry bids (both highest and
geometric mean). The Paddock et al. and government models give very highly
correlated values, and neither comes close to predicting industry bids. The
highest industry bid would generally correspond to the market price, provid-
ing a comparison between real option values and transaction prices. While
these high bids are more than twice either the option-based or government
valuations, the mean industry bid is within the range (either above or below
depending on the assigned value for gas) of the alternative valuations. As the
authors point out, due to a "winner's curse," the high bid may exceed the true
expected tract value.
In Section I we discuss our model that prices land, incorporating the option
to wait to develop. The option value is a function of the building developed on
the site and development costs. In Section II, the marginal prices of each
building's characteristics are estimated using hedonic estimation on a sepa-
rate sample of 3200 developed properties. Using these results, we calculate
the value of an optimally scaled building for each of 2700 undeveloped
properties. In Section III we evaluate the theoretical land values given by the
option-based model relative to the intrinsic values and to market prices. We
present conclusions in Section IV.

I. The Model

The model we consider is a fairly general, infinite horizon, continuous time
model that in form most closely resembles Williams (1991a), but also tests

³ The finding of small but consistently positive premia seems reasonable given that Seattle
experienced moderate growth during the sample period (1976 to 1979). However, the exact
figures obtained for Seattle may not be representative of the overall economy, given the city's
dependence on a single industry (aerospace).

Empirical Testing of Real Option-Pricing Models
623

the implications of Titman (1985). The principal features of previous optimal
timing models are incorporated.
Through ownership of an undeveloped or underdeveloped property, the
landholder holds a perpetual option to construct an optimal size building at
an optimal time, subject to zoning restrictions. The cost of development is,
$$X = f + q^\gamma x_1,$$ (1)
where $f$ represents fixed costs, $q$ is the square footage of the building, $\gamma$ is
the cost elasticity of scale, and $x_1$ is the development cost per square foot.
Development costs are assumed to follow a geometric Brownian motion with
a constant drift, $\alpha_x$, and a constant variance, $\sigma_x^2$,
$$dX/X = \alpha_x dt + \sigma_x dz_x.$$ (2)
We assume that the price $P$ of the underlying asset, the building, is
observable. The implications of this assumption are discussed in Section
III.B. $P$ is given by $P = q^\phi e$, where $e$ is a function of other attributes of the
property and $\phi$ is the price elasticity of scale. The complete formulation and
estimation of $P$ are discussed in Section III. A. $P$ follows a geometric Brown-
ian motion with constant drift, $\alpha_p$, and constant variance, $\sigma_p^2$,
$$dP/P = (\alpha_p - x_2) dt + \sigma_p dz_p,$$ (3)
where $x_2$ are payouts to the developed property and $\rho dt$ is the constant
correlation between $dz_x$ and $dz_p$. We require that the cost elasticity of scale,
$\gamma$, exceed the price elasticity of scale, $\phi$.⁵

⁴ We allow for $\phi < 1$, giving a concave relationship between price and building size in the
option model, which is consistent with the relationship estimated in the hedonic function
described in Section III.A. This concave relationship may exist for several reasons. Colwell
(1992) argues that the cost functions are concave because the exterior walls increase less than
proportionally to the floorspace. Concavity in the industry offer curves requires, in turn, that the
lower envelope of the offer curves, and hence the hedonic function, must be concave. For the
building as a whole, the marginal cost curve must intersect the marginal price curve from below
in order to obtain an interior solution for the optimal building size. In the market for commercial
space, there might be a downward sloping demand curve for a given location, and it is likely that
as the building size grows, the prime rentable space decreases as a proportion of the total space
(e.g., more interior offices). In the market for residential space doubling an apartment's size does
not normally double the rent, since it would still only suit one family and have one kitchen.
⁵ Williams' (1991a) model assumes that unit development costs ($x_1$) and unit cash inflows to
the developed property ($x_2$) are the underlying stochastic variables, both following lognormal
processes. The data that we have provides information about building prices, but not about the
rents generated by the building. Therefore, we alter the Williams' model with the assumption
that the building price and total construction costs, both dependent on scale, are the state
variables. Williams solves for price as a linear function of unit cash inflows ($P = \pi q x_2$, $\pi$
constant), and he assumes that total development cost is a linear function of unit development
cost ($X = x_1 q^\gamma$). Therefore the two derivations are formally equivalent. However, we are not
required to make the assumption, as Williams does, that price is a linear function of scale and
therefore that development costs must exhibit decreasing returns to scale (in order to obtain an
interior solution to the optimal scale problem). Instead, with our formulation we require only
that the scale cost parameter exceed the price elasticity of scale, thus allowing for either
increasing or decreasing returns to scale.

624
The Journal of Finance

We also make the following assumptions. There is a known riskless instan-
taneous interest rate, $i$, which is constant through time and equal for
borrowers and lenders. Land owners are price takers, giving a partial equilib-
rium model.⁶ The investment is irreversible, i.e., once the investor has built
on the property, it no longer has any optimal timing value. $\beta P$ is the income
to the undeveloped or underdeveloped property.⁷
Finally, we assume that there is an equilibrium in the economy in which
contingent claims on the pair of processes for the development costs and
building price, ($X, P$) are uniquely priced.⁸ We will represent the correspond-
ing pricing operator by taking the expectation of future cash flows under the
risk-adjusted probability measure and discounting at the risk-free rate. This
is carried out by changing the drifts of $X$ and $P$, $\alpha_x$ and $\alpha_p$, respectively, to
$\nu_x = \alpha_x - \lambda_x \sigma_x$ and $\nu_p = (\alpha_p - x_2) - \lambda_p \sigma_p$, where $\lambda_x$ and $\lambda_p$ are constant
parameters representing the excess mean return per unit of standard devia-
tion. We can then express the value of the undeveloped property, $V(X, P)$, as
the solution to the fundamental valuation equation:
$$0 = 0.5\sigma_x^2 X^2 V_{xx} + \rho\sigma_x\sigma_p XPV_{xp} + .5\sigma_p^2 P^2 V_{pp} + \nu_x X V_x + \nu_p P V_p - iV + \beta P,$$ (4)
subject to the appropriate boundary conditions.
Making a change of variables, $z = P/X$ and $W(z) = V(X, P)/X$, we obtain:
$$0 = 0.5\omega^2 z^2 W'' + (\nu_p - \nu_x)zW' + (\nu_x - i)W + \beta z,$$ (5)
where
$$\omega^2 = \sigma_x^2 - 2\rho\sigma_x\sigma_p + \sigma_p^2.$$
To solve this differential equation, we assume that there is a ratio of the
building price to development costs, $z$, at which it is optimal to build. The
investor exercises optimally at this "hurdle ratio," $z^*$, giving the "smooth-
pasting" condition. The Appendix provides a more detailed solution and
description of these conditions.

⁶ The model assumes that an individual's decision to develop has no impact on the market
price of buildings. The empirical implications of this assumption are discussed in Section III. B.
Williams (1991b) models a Nash equilibrium among developers.
⁷ The payouts to the undeveloped property are thereby assumed to be proportional to the
developed property value.
⁸ This assumption is sometimes derived as a consequence of no arbitrage opportunities in an
economy in which there exist tradeable securities whose prices are perfectly correlated with $P$
and $X$. See, e.g., Titman (1985) and Brennan and Schwartz (1985). Given the nature of the
underlying processes, we find it more palatable not to explicitly rely on a hedging argument. An
equilibrium similar to the one we assume was explicitly derived by Rubinstein (1976) and
applied by Milne and Turnbull (1991). An intermediate solution assumes that the component of
the risk in ($P, X$) that is priced in equilibrium can be dynamically spanned by tradeable
securities.

Empirical Testing of Real Option-Pricing Models
625

The solution is given as follows:
$$V(P,X) = X(Az^j + k),$$ (6)
where,
$$A = (z^* - 1 - k)(z^*)^{-j},$$
$$z^* = j(1 + k)/(j - 1),$$
$$k = \beta z/(i - \nu_x),$$
$$j = \omega^{-2} (.5\omega^2 + \nu_x - \nu_p + [\omega^2 (.25\omega^2 - \nu_p - \nu_x + 2i) + (\nu_x - \nu_p)^2]^{.5})$$
$$z = P/X$$
The intrinsic value of the option can be found by taking the limit of (6) as
the variance $\omega$ goes to zero. This result is given by,
$$V^I(X, P) = P - X, \quad z \ge 1 + k$$
$$V^I(X, P) = \beta P/(i - \nu_x), \quad z < 1 + k$$ (7)
If the ratio $z = P/X$ exceeds $1 + k$, the landowner will build immediately.
Otherwise he will hold the land for the income it generates.⁹
For tractability, the optimal scale or building square footage, $q^*$, is deter-
mined by the initial values of $P$ and $X$, and is therefore the same for both the
option-based value, $V(P, X)$, and the intrinsic value, $V^I(P, X)$. This assump-
tion understates the value of the option, as we discuss further in Section
III.B. $q^*$ is found by maximizing the value of the undeveloped property,
$V(q) = P(q) - X(q) = q^\phi e - (f + q^\gamma x_1)$, over $q$. The solution is,
$$q^* = (\gamma X_1/\epsilon\phi)^{(\gamma/(\phi-\gamma))} \quad q^* < \delta$$
$$q^* = \delta \quad q^* \ge \delta,$$ (8)
where $\delta$ is the maximum size permitted by the zoning regulations.
Our empirical work examines the option-based value given by (6), com-
pared to the intrinsic value (7) and compared to market prices. The building
is assumed to be built to the optimal scale in (8), and the optimal time to
build is when the ratio of building price to development costs exceeds $z^*$, in
(6).

II. The Data

The primary data set consists of a large number of real estate transactions
within the city of Seattle.¹⁰ All properties are within the city limits and are
zoned for investment purposes: business, commercial, industrial, or low- and

⁹ This "hurdle ratio," $1 + k$, corresponds to the ratio $z^*$ in the option-based model. It is found
by taking the limit of $z^*$ as $\omega \to 0$ ($j \to 1$).
¹⁰ The source of the data is the Real Estate Monitor Corporation.

626
The Journal of Finance

high-density residential.¹¹ The data cover the second half of 1976 through the
end of 1979 and include the characteristics of 3200 transactions of developed
properties (developed to a reasonable approximation of the permitted zoning)
and 2700 transactions of unimproved land parcels. The data on the developed
properties are used in the hedonic estimation of the potential building values.
The unimproved parcels represent the real options, the land which the owner
has the option to develop.
The cost function is given by (1). These costs are estimated using the
Marshall Valuation Service. This service provides indexes of per-square-foot
construction costs for various types and qualities of buildings and assigns
multipliers for adjusting these unit costs to particular years and localities.¹²
Estimation of the cost scale parameter $\gamma$ is described in Section III.C.

III. Empirical Results

A. Estimates of Building Values

Land is valued as an option, for which the underlying asset is the building
that potentially would be built on that site. The price of this building is not
observable, and thus must be estimated. The method we employ is hedonic
estimation. Hedonic theory focuses on markets in which a generic commodity
can embody varying amounts of each of a vector of characteristics or at-
tributes $Z$. A hedonic price function $p(Z)$ specifies how the market price of a
commodity varies as these characteristics vary. Rosen (1974) provides a
theoretical framework in which $p(Z)$ emerges as the equilibrium price aris-
ing from bids and offers of the suppliers and demanders of the good. The
distribution of the quantity, as a function of $Z$, that is supplied and consumed
is also endogenously determined.
We separate the sample into years (1976-1977, 1978, and 1979) and into
five zoning categories (commercial, business, industrial, low-density residen-
tial, and high-density residential), to improve the predictive power of the
coefficients.¹³ For each subsample, we regress the log price for an improved

¹¹ The Seattle Zoning Code classifies these zoning categories cumulatively. The lowest (i.e.
most inclusive) zoning category is industrial. Commercial includes nonretail business and light
manufacturing. The purpose of business zoning is to provide for retail and office uses. The lowest
residential use (high rise and mixed use) is not included in our sample because there were few
data points and a large amount of heterogeneity. Therefore, what we term high-density residen-
tial is actually medium density (midrise). Low-density residential includes duplexes and triplexes.
¹² We calculate the 1977 to 1979 square foot costs for building types according to the purpose
of each zoning category (apartment, store, office, warehouse, and industrial building) for an
average quality C and a good quality B building, and chose values at the middle of each range.
These costs range from $23 per square foot to $34 per square foot. We assume fixed costs of
$10,000.
¹³ A Wald test of the restrictions that the parameters are the same across zoning categories is
statistically significant in nearly all cases. Therefore, we separated these groups in this first
estimation, and also in the tests of the land valuation model.

Empirical Testing of Real Option-Pricing Models
627

property on its characteristics,
$$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$$ (9)
The independent variables included are the log of square footage of the
building ($q$), the log of the lot ($LSF$), and the height and age of the building.
$L$ is a vector of six dummy variables, obtained by combining groups of census
tracts in the city. These are abbreviated $n$ (north), $w$ (west), $ce$ (central east),
$cw$ (central west), $se$ (southeast), and $sw$ (southwest). $Q$ is a vector of dummy
variables representing the quarter in which the property was sold, with the
last quarter of each subsample omitted. This functional form is used because
its Box-Cox transformation gives the highest log likelihood, lowest standard
error, and highest $R^2$.
From these equations we estimate the coefficients to be used to determine
the potential building value on an undeveloped plot of land. The results from
each of these regressions are presented in Tables I to V. The fit of the
regressions is good for all zoning categories and all years, with $R^2$ ranging
from 80.2 to 95.6. Each of the price elasticities of size is less than one and
significantly greater than zero at conventional levels. The elasticity of lot size
is fairly large, in most cases greater than 0.5. The elasticity of building size
ranges approximately between 0.3 and 0.5. This situation is reversed for
low-density residential properties, for which the elasticity of the building size
is much higher than that of the lot. The estimates vary across years; the
variation might reflect that each data set consists of the differing properties
that have sold each year. However, because of the unknown time series
properties of this data, it is possible that the standard errors are understated.
Therefore, we cannot reject the hypothesis that the true elasticities are
constant across time.
For business and commercial properties, the downtown area (central west,
$cw$) is the eliminated locational dummy variable. For all other subsamples
the north is eliminated due to the lack of data points in the downtown area.
From these estimates it is clear that Seattle is not a monocentric city, and
that a simple variable measuring the distance from the city center would not
capture important locational features. In particular, the area east of down-
town (central east, $ce$) is a location that has negative price effects. North and
west generally add to value, while central west is not always the most
attractive location.¹⁴
When the coefficient for age is statistically significant, age has a negative
impact. For the height levels that make up most of the sample, the effect of
height on value is increasing at a decreasing rate, although the coefficients on
these variables often are only marginally significant.

¹⁴ Our goal was to estimate coefficient that serve as predictors of marginal prices. We
separated the city into as many regions as possible, given the number of data points in each
region.

628
The Journal of Finance

# Table I
## Hedonic Estimation for Business Properties in Seattle
$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$

For each property, $i$, $P$ is the price; $q$ and $LSF$ are the building and lot sizes, respectively, as
measured in square feet. Height ($HT$) is measured in stories and age in years. $L$ and $Q$ are
dummy variables representing the location and quarter in which the sale took place. The last
quarter of each time period and Central West are omitted variables. $N$ is the sample size. The
regression is estimated separately for each of the three time periods.

| | 1976-1977 | 1978 | 1979 |
| :---------------- | :-------- | :-------- | :-------- |
| R-squared | 0.922 | 0.843 | 0.878 |
| Std. Error | 0.312 | 0.457 | 0.426 |
| F-statistic | 156.11 | 67.31 | 82.86 |
| N | 215 | 177 | 164 |
| **Variable** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** |
| Constant | -0.741 | 0.463 | 3.210 | 0.575 | 1.152 | 0.527 |
| log(q) | 0.565 | 0.039 | 0.495 | 0.058 | 0.314 | 0.057 |
| log(LSF) | 0.875 | 0.063 | 0.507 | 0.067 | 0.935 | 0.061 |
| HT | 0.126 | 0.053 | 0.163 | 0.066 | 0.255 | 0.094 |
| HT$^2$ | -0.011 | 0.006 | -0.006 | 0.004 | -0.019 | 0.011 |
| AGE | -0.003 | 0.001 | -0.005 | 0.002 | -0.003 | 0.002 |
| **Locations** | | | | | | |
| North | -0.158 | 0.089 | -0.074 | 0.147 | -0.185 | 0.134 |
| West | -0.101 | 0.094 | 0.070 | 0.158 | -0.262 | 0.148 |
| Central east | -0.355 | 0.100 | -0.434 | 0.172 | -0.276 | 0.146 |
| Central west | 0 | | 0 | | 0 | |
| Southeast | -0.340 | 0.094 | -0.117 | 0.172 | -0.198 | 0.159 |
| Southwest | -0.415 | 0.105 | -0.511 | 0.166 | -0.332 | 0.155 |
| **Quarters** | | | | | | |
| 76-3 | -0.202 | 0.078 | 78-1 | -0.258 | 0.097 | 79-1 | -0.190 | 0.143 |
| 76-4 | -0.075 | 0.065 | 78-2 | -0.167 | 0.098 | 79-2 | -0.136 | 0.147 |
| 77-1 | -0.067 | 0.081 | 78-3 | -0.007 | 0.112 | 79-3 | -0.120 | 0.148 |
| 77-2 | -0.045 | 0.070 | | | | | |
| 77-3 | -0.039 | 0.084 | | | | | |

In order to predict the building value that corresponds to a particular plot
of land, we need to estimate the size and height of the building. From Section
I, the building price is given by $P(q) = q^\phi e$ where the building size, $q$, and
the price elasticity of scale, $\phi$, are the same as in the hedonic equation (9),
and $e$ is a function of other attributes of the property. We assume that the
investor develops the optimally sized building, $q = q^*$, as given by equation
(8).
We base the height estimates on existing property heights, so that the
estimated height, $HT$, of a given property is equal to the average height for
the relevant zoning and location. We then conclude that the estimated value
of a building developed on each of the 2700 land transactions is given by,
$$P_i = q^{*\phi} LSF^\psi \exp\{c + a_1 HT_i + a_2 HT_i^2 + b'L_i + d'Q_i + e_i\}$$ (10)

Empirical Testing of Real Option-Pricing Models
629

# Table II
## Hedonic Estimation for Commercial Properties in Seattle
$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$

For each property, $i$, $P$ is the price; $q$ and $LSF$ are the building and log sizes, respectively, as
measured in square feet. Height ($HT$) is measured in stories and age in years. $L$ and $Q$ are
dummy variables representing the location and quarter in which the sale took place. The last
quarter of each time period and Central West are omitted variables. $N$ is the sample size. The
regression is estimated separately for each of the three time periods.

| | 1976-1977 | 1978 | 1979 |
| :---------------- | :-------- | :-------- | :-------- |
| R-squared | 0.885 | 0.856 | 0.893 |
| Std. Error | 0.336 | 0.397 | 0.326 |
| F-statistic | 108.9 | 54.26 | 75.05 |
| N | 229 | 133 | 131 |
| **Variable** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** |
| Constant | 1.887 | 0.366 | 2.854 | 0.476 | 0.853 | 0.469 |
| log(q) | 0.419 | 0.036 | 0.501 | 0.064 | 0.415 | 0.050 |
| log(LSF) | 0.702 | 0.038 | 0.513 | 0.067 | 0.804 | 0.061 |
| HT | 0.051 | 0.068 | 0.151 | 0.076 | 0.209 | 0.059 |
| HT$^2$ | -0.002 | 0.011 | -0.004 | 0.005 | -0.014 | 0.004 |
| AGE | -0.006 | 0.001 | -0.004 | 0.002 | -0.000 | 0.002 |
| **Locations** | | | | | | |
| North | -0.119 | 0.090 | 0.080 | 0.146 | -0.055 | 0.103 |
| West | 0.144 | 0.085 | 0.151 | 0.154 | -0.064 | 0.102 |
| Central east | -0.208 | 0.100 | -0.267 | 0.160 | 0.075 | 0.127 |
| Central west | 0 | | 0 | | 0 | |
| Southeast | -0.283 | 0.134 | 0.090 | 0.261 | -0.065 | 0.185 |
| Southwest | -0.325 | 0.104 | -0.199 | 0.178 | -0.285 | 0.116 |
| **Quarters** | | | | | | |
| 76-3 | -0.148 | 0.079 | 78-1 | -0.228 | 0.092 | 79-1 | -0.092 | 0.098 |
| 76-4 | -0.086 | 0.078 | 78-2 | -0.122 | 0.105 | 79-2 | -0.026 | 0.092 |
| 77-1 | -0.079 | 0.073 | 78-3 | -0.008 | 0.104 | 79-3 | 0.059 | 0.094 |
| 77-2 | -0.084 | 0.087 | | | | | |
| 77-3 | 0.017 | 0.067 | | | | | |

where the $L$, $LSF$, and $Q$ represent the actual location, size, and date sold of
each parcel.

B. Observation Errors

There are a number of sources of error in our estimation. Consistent with
the assumption of an exogenously given building price process, the estimated
building values do not account for a possible depression in prices due to
additions to supply. This would tend to overstate the value of the building if
the true price process reflects a downward sloping demand curve. The
intrinsic value of the land would tend to be overstated and the option
premium correspondingly understated. However, the sample consists of many
scattered, mostly small, heterogeneous lots in a market which at the time

630
The Journal of Finance

# Table III
## Hedonic Estimation for Industrial Properties in Seattle
$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$

For each property, $i$, $P$ is the price; $q$ and $LSF$ are the building and lot sizes, respectively, as
measured in square feet. Height ($HT$) is measured in stories and age in years. $L$ and $Q$ are
dummy variables representing the location and quarter in which the sale took place. The last
quarter of each time period and North are omitted variables. $N$ is the sample size. The
regression is estimated separately for each of the three time periods.

| | 1976-1977 | 1978 | 1979 |
| :---------------- | :-------- | :-------- | :-------- |
| R-squared | 0.824 | 0.948 | 0.956 |
| Std. Error | 0.464 | 0.318 | 0.252 |
| F-statistic | 22.0 | 26.8 | 45.5 |
| N | 75 | 33 | 41 |
| **Variable** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** |
| Constant | 2.740 | 0.907 | 2.866 | 0.923 | 1.989 | 0.512 |
| log(q) | 0.332 | 0.085 | 0.373 | 0.105 | 0.289 | 0.058 |
| log(LSF) | 0.728 | 0.082 | 0.681 | 0.110 | 0.789 | 0.054 |
| HT | -0.329 | 0.422 | -0.177 | 0.283 | 0.171 | 0.202 |
| HT$^2$ | 0.085 | 0.108 | 0.037 | 0.042 | 0.013 | 0.030 |
| AGE | 0.000 | 0.003 | -0.004 | 0.004 | 0.001 | 0.003 |
| **Locations** | | | | | | |
| North | 0 | | 0 | | 0 | |
| West | -0.224 | 0.222 | -0.079 | 0.372 | -0.230 | 0.234 |
| Central east | * | | -0.144 | 0.372 | -0.651 | 0.293 |
| Central west | * | | * | | 1.011 | 0.316 |
| Southeast | -0.491 | 0.225 | -0.102 | 0.186 | -0.330 | 0.159 |
| Southwest | -0.288 | 0.149 | -0.108 | 0.176 | -0.277 | 0.147 |
| **Quarters** | | | | | | |
| 76-3 | -0.590 | 0.278 | 78-1 | -0.548 | 0.302 | 79-1 | -0.353 | 0.189 |
| 76-4 | -0.460 | 0.259 | 78-2 | -0.431 | 0.241 | 79-2 | -0.262 | 0.178 |
| 77-1 | -0.412 | 0.253 | 78-3 | -0.308 | 0.233 | 79-3 | -0.169 | 0.195 |
| 77-2 | -0.283 | 0.263 | | | | | |
| 77-3 | -0.107 | 0.258 | | | | | |

\* No transactions in this region.

was neither saturated nor underdeveloped. The supply of land available for
development was fairly limited. The building on each of these lots probably
does not have much impact on the price. Therefore, the potential for substan-
tially overstating the building value due to the assumption of exogeneity is
much smaller than for a large tract of similar properties.
In addition, we may tend to overstate the true price because we observe
prices only for those undeveloped or developed properties that sell. However,
we also assume that the observable characteristics of existing buildings have
the same marginal prices as the new buildings, and we only control for the
depreciation of the existing stock in a simple way. This assumption would
tend to understate the true price. Note that we do not assume that the new
building is developed to the maximum density. We assume only that its value

631
Empirical Testing of Real Option-Pricing Models

# Table IV
## Hedonic Estimation for Low-Density Residential Properties in Seattle
$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$

For each property, $i$, $P$ is the price; $q$ and $LSF$ are the building and lot sizes, respectively, as
measured in square feet. Height ($HT$) is measured in stories and age in years. $L$ and $Q$ are
dummy variables representing the location and quarter in which the sale took place. The last
quarter of each time period and North are omitted variables. $N$ is the sample size. The
regression is estimated separately for each of the three time periods.

| | 1977 | 1978 | 1979 |
| :---------------- | :-------- | :-------- | :-------- |
| R-squared | 0.820 | 0.815 | 0.856 |
| Std. Error | 0.288 | 0.282 | 0.254 |
| F-Statistic | 112.2 | 112.7 | 121.6 |
| N | 361 | 319 | 259 |
| **Variable** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** |
| Constant | 2.560 | 0.400 | 3.611 | 0.350 | 0.948 | 0.306 |
| log(q) | 0.800 | 0.036 | 0.622 | 0.374 | 0.637 | 0.034 |
| log(LSF) | 0.279 | 0.044 | 0.378 | 0.044 | 0.631 | 0.042 |
| HT | 0.195 | 0.114 | -0.152 | 0.159 | 0.022 | 0.041 |
| HT$^2$ | -0.054 | 0.031 | 0.051 | 0.046 | -0.001 | 0.002 |
| AGE | -0.006 | 0.001 | -0.005 | 0.001 | -0.001 | 0.001 |
| **Locations** | | | | | | |
| North | 0 | | 0 | | 0 | |
| West | 0.127 | 0.047 | 0.040 | 0.052 | 0.046 | 0.048 |
| Central east | -0.292 | 0.047 | -0.467 | 0.049 | -0.064 | 0.053 |
| Central west | * | | * | | * | |
| Southeast | -0.073 | 0.044 | -0.072 | 0.051 | -0.097 | 0.056 |
| Southwest | -0.399 | 0.057 | -0.358 | 0.052 | -0.072 | 0.050 |
| **Quarters** | | | | | | |
| 76-3 | -0.359 | 0.060 | 78-1 | -0.333 | 0.045 | 79-1 | -0.287 | 0.061 |
| 76-4 | -0.309 | 0.061 | 78-2 | -0.213 | 0.046 | 79-2 | -0.243 | 0.045 |
| 77-1 | -0.241 | 0.048 | 78-3 | -0.117 | 0.047 | 79-3 | -0.010 | 0.044 |
| 77-2 | -0.235 | 0.048 | | | | | |
| 77-3 | -0.191 | 0.047 | | | | | |

\* No transactions in this region.

is estimated based on values of other buildings in the same zoning classifica-
tion, which generally are not developed to the maximum density.¹⁵ In sum,
the building value estimation introduces several potential biases, the net
impact of which is difficult to gauge.

¹⁵ Because the zoning is cumulative, we attempted a search over all possible building types for
a given zoning category, e.g., allowing an industrial parcel to be developed commercially. The
prices obtained were unreasonably high, indicating that the industrial parcel could not command
the same marginal prices as a commercially zoned parcel. The fact that the land was zoned as
industrial conveys information about its location and potential. Moreover, the marginal prices we
estimate for the industrial parcel are based only on other industrially zoned lots, which are not
necessarily developed to the maximum density.

632
The Journal of Finance

# Table V
## Hedonic Estimation for High-Density Residential Properties in Seattle
$\log P_i = c + \phi \log q_i + \psi \log LSF_i + a_1 HT_i + a_2 HT_i^2 + a_3 AGE_i + b'L_i + d'Q_i + e_i$

For each property, $i$, $P$ is the price; $q$ and $LSF$ are the building and lot sizes, respectively, as
measured in square feet. Height ($HT$) is measured in stories and age in years. $L$ and $Q$ are
dummy variables representing the location and quarter in which the sale took place. The last
quarter of each time period and North are omitted variables. $N$ is the sample size. The
regression is estimated separately for each of the three time periods.

| | 1977 | 1978 | 1979 |
| :---------------- | :-------- | :-------- | :-------- |
| R-squared | 0.859 | 0.848 | 0.802 |
| Std. Error | 0.379 | 0.353 | 0.350 |
| F-statistic | 161.3 | 119.4 | 54.8 |
| N | 413 | 269 | 175 |
| **Variable** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** | **Coeff.** | **Std. Error** |
| Constant | 3.181 | 0.274 | 2.637 | 0.401 | 2.472 | 0.492 |
| log(q) | 0.595 | 0.045 | 0.772 | 0.050 | 0.548 | 0.063 |
| log(LSF) | 0.407 | 0.051 | 0.315 | 0.062 | 0.593 | 0.071 |
| HT | 0.090 | 0.069 | 0.149 | 0.110 | 0.015 | 0.122 |
| HT$^2$ | -0.004 | 0.010 | -0.031 | 0.020 | -0.002 | 0.023 |
| AGE | -0.007 | 0.001 | -0.003 | 0.001 | -0.003 | 0.001 |
| **Locations** | | | | | | |
| North | 0 | | 0 | | 0 | |
| West | 0.118 | 0.058 | * | | * | |
| Central east | -0.159 | 0.053 | 0.018 | 0.070 | 0.021 | 0.094 |
| Central west | 0.156 | 0.391 | -0.178 | 0.055 | -0.080 | 0.693 |
| Southeast | -0.056 | 0.073 | 0.152 | 0.089 | 0.007 | 0.126 |
| Southwest | -0.282 | 0.073 | -0.203 | 0.094 | 0.068 | 0.136 |
| **Quarters** | | | | | | |
| 76-1 | -0.296 | 0.069 | 78-1 | -0.249 | 0.064 | 79-1 | -0.221 | 0.123 |
| 76-2 | 0.252 | 0.069 | 78-2 | -0.189 | 0.064 | 79-2 | -0.273 | 0.126 |
| 77-1 | -0.254 | 0.068 | 78-3 | -0.001 | 0.064 | 79-3 | -0.174 | 0.124 |
| 77-2 | -0.212 | 0.058 | | | | | |
| 77-3 | -0.140 | 0.059 | | | | | |

\* No transactions in this region.

The state variable to the option model is the ratio $z$ of the building price to
development costs. Both these values are likely to be observed with error.
Since $z$ centers into the model in a nonlinear way, the expected value of the
land is affected by the estimation error. To be specific, if we assume that the
estimation error is normal and multiplicative, i.e., if $\ln \tilde{z} = \ln z + \epsilon$ and $\epsilon$ is
distributed $N(0, \sigma_\epsilon^2)$, then,
$$E[W(\tilde{z})] = Az^j \exp(j^2 \sigma_\epsilon^2/2) + k > W(z).$$ (11)
The presence of this bias means that we are more likely to reject the null
hypothesis, and therefore that our tests tend to be more conservative than

Empirical Testing of Real Option-Pricing Models
633

stated. In addition, in our regressions of theoretical prices on actual prices,
the presence of errors-in-variables problems biases the slope coefficient down-
ward and the intercept upward.¹⁶
We assumed that the building price is observable. For many reasons,
including building delay, the value is usually not observable. As was shown
in Flesaker (1991), this uncertainty can lead to errors of omission, in which
the option is not exercised when it should be, or errors of commission, in
which the option is exercised when it should not be, and uniformly lowers the
value of the option itself. However, if the developer retains the option to alter
the building plans during the building process, the option value may possibly
increase.

C. Results from Tests of the Land Valuation Model

In this section we discuss the results of the estimation and specification
tests. As with the hedonic estimation, we break the sample into the five data
classes organized by zoning category, for which the parameters are assumed
constant across each class. We evaluate real option values, (6), relative to
market prices and to the intrinsic values, (7).
In order to calculate the model prices, we must make assumptions about
several parameters. We assume that the risk-adjusted drift parameters
$\nu_p = \nu_x = 0.03$ and the interest rate $i = 0.08$. The model does not appear to be
very sensitive to these assumptions. We find, however, that the theoretical
values are extremely sensitive to assumptions regarding the values of the
development cost scale parameter, $\gamma$, and the payout to the underdeveloped
property, $\beta$. Since we lack information about the true values of these vari-
ables, we estimate values that minimize the pricing errors in our sample. We
estimate a value for $\beta$ ranging from 0.3% to 3% of the developed building
value. Our priors were that $\gamma$ should be less than but close to one, giving
some economies of scale. The values we estimate range from 0.9 to 1. The
prices we calculate are extremely sensitive to $\gamma$, primarily through its func-
tion in determining the optimal building size. Only a small fraction of the
sample was developed to the maximum density.
Because both the intrinsic value and option-based value models depend in
the same way on the building value, development costs, and land payout, the
estimates of $\gamma$ and $\beta$, the optimal building size $q^*$, and the height assump-
tions should affect the option model and intrinsic value equivalently.¹⁷ That
is, for positive variance, reasonable changes in these values do not alter the
theoretically positive difference between the option model price and intrinsic
value.
Table VI shows variance estimates that are "implied" from the real option
model. The parameter we estimate is $\omega^2$, given by (5), which is the variance
of the developed property value and development costs. The standard errors

¹⁶ See Theil (1971), for example.
¹⁷ In the intrinsic value case, the building is either developed immediately, a function of the
factors which affect $P$ and $X$, or held as income-producing land, a function of $P$ and $\beta$.

634
The Journal of Finance

# Table VI
## Variance Estimates Implied from the Option Model
We estimate Var($P, X$), the variance of developed property value, $P$, and development costs, $X$,
from the option model (equation (6)), which incorporates the option to wait to develop land. The
standard error is of this estimate. The variance and standard deviation of developed property
value, $P$, are calculated assuming a 5% annual standard deviation of development costs and zero
covariance.

| | n | Var ($P, X$) | Standard Error | Var ($P$) | Standard Deviation ($P$) |
| :------------------------ | :-- | :----------- | :------------- | :-------- | :----------------------- |
| **Business** | | | | | |
| 1977 | 76 | 0.0369 | 0.0030 | 0.0344 | 0.1855 |
| 1978 | 64 | 0.0616 | 0.0053 | 0.0591 | 0.2431 |
| 1979 | 48 | 0.0571 | 0.0046 | 0.0546 | 0.2337 |
| **Commercial** | | | | | |
| 1977 | 102 | 0.0503 | 0.0024 | 0.0478 | 0.2186 |
| 1978 | 90 | 0.0533 | 0.0032 | 0.0508 | 0.2254 |
| 1979 | 73 | 0.0526 | 0.0024 | 0.0501 | 0.2238 |
| **Industrial** | | | | | |
| 1977 | 62 | 0.0525 | 0.0037 | 0.0500 | 0.2236 |
| 1978 | 43 | 0.0813 | 0.0038 | 0.0788 | 0.2807 |
| 1979 | 25 | 0.0658 | 0.0073 | 0.0633 | 0.2516 |
| **Low-density residential** | | | | | |
| 1977 | 490 | 0.0720 | 0.0011 | 0.0695 | 0.2636 |
| 1978 | 401 | 0.0577 | 0.0017 | 0.0552 | 0.2348 |
| 1979 | 340 | 0.0488 | 0.0016 | 0.0463 | 0.2152 |
| **High-density residential** | | | | | |
| 1977 | 224 | 0.0475 | 0.0014 | 0.0450 | 0.2121 |
| 1978 | 336 | 0.0647 | 0.0031 | 0.0622 | 0.2494 |
| 1979 | 360 | 0.0699 | 0.0022 | 0.0674 | 0.2595 |

of the estimates are very low. We then present values for the variance and
standard deviations of the developed property value only, assuming the $\rho = 0$
and $\sigma_x = 0.05$. We find annual standard deviations ranging from 18.55% to
28.07%, with no significant differences among the different property types.¹⁸
We can reject that the variance is constant, but we do not find any uniform
movement up or down in the variance estimates across the years.
Because these figures represent the annual standard deviation of individ-
ual properties, based on actual prices rather than on appraisals, it is difficult
to find comparable numbers in the literature. The closest we find comes from
a recent study by Case and Shiller (1989) of repeat sales; the study reports a
15% annual standard deviation of individual housing prices, from 1970 to
1986, in Atlanta, Chicago, Dallas, and San Francisco-Oakland. Titman and
Torous (1989) estimate an implied property value standard deviation of

¹⁸ Clearly, different cities and different sample periods would generate different results. The
results obtained in this study provide an indication of how the model fares empirically, but do
not purport to be representative.

Empirical Testing of Real Option-Pricing Models
635

15.5% using their commercial mortgage-pricing model.¹⁹ There is a funda-
mental inconsistency in utilizing a model that assumes constant variance to
estimate implied variances that are allowed to change. This issue has been
addressed in several papers. Preliminary findings of Sheik and Vora (1990)
show that, under certain circumstances that allow for changing variance
(such as a constant elasticity of variance diffusion process), implied volatili-
ties measure the average volatility of the underlying stocks' returns fairly
accurately.
Based on our assumptions and estimates, most properties would not be
developed if the investor correctly accounts for the option to wait. For most
properties the current ratio of building price to development costs, $z$, is still
less than the optimal development ratio $z^*$. However, most properties would
be developed in the intrinsic value case, where a null variance is assumed.
We lack information about the actual development of these properties,²⁰ and
therefore cannot test whether the developer follows an optimal strategy.
In Table VII, we present summary statistics for the option-based model
price and the intrinsic value. As expected, the former exceeds the latter in
every subsample, and in some cases by a substantial margin. Based on these
values, we calculate the option (time) premium as the mean percentage
difference bewteen the option model price and the intrinsic value. These
premia range from 1% to 30%, with a mean of 6%.²¹ In support of the theory,
they are consistently positive. There is no reason for the estimated option
premium to be constant across the sample, since properties bought for
current development should have a premium of zero, while more "speculative"
transactions could have premia approaching 100% of the value. We consider
that these numbers represent a lower bound on the option premium for land,
since our sample consists of urban land during a period of expansion in a city
with tight growth controls.²² Some larger figures appear, especially for
industrial properties.²³ When the industrial properties are excluded, the
average premium is 5%. As previously discussed, our assumptions and

¹⁹ By comparison, Cox and Rubinstein (1985) report individual stock standard deviations
ranging from 17% (for utilities) to 68% (for Winnebago) during the 1980 to 1984 sample period.
²⁰ From 1977 to 1979 Seattle experienced a steady increase in building permits for all property
types, but building activity subsequently dropped off. No trend can be seen in our data which
reflects the statistics.
²¹ This mean is calculated across all observations, i.e., $\Sigma_i (N_{op_i})/N$, where for each subsam-
ple $i$, $N_i$ is the number of observations and $op_i$ is the option premium, and $N$ is the total
number of observations (2734).
²² We would expect higher premia in locations where very little building is currently taking
place, indicating that the value in the land is mostly as an option to build far out in the future.
The overall expansion in Seattle during this period indicates that many options are "in the
money."
²³ The premia for the industrial properties are not driven by just a few outliers. The industrial
properties have by far the widest range of sizes and prices compared to the other zoning
categories. The land prices and lot sizes are also the largest. Given the small sample size and
heterogeneous data, it is quite possible that the building values fitted from the hedonic
regressions are less representative of the sample of vacant lots than for the other categories. It is
also possible that the industrial properties in 1977 and 1978 do have a larger option premium.

636
The Journal of Finance

# Table VII
## Summary Statistics and Option Premia
Average land values given by the option model (equation (6)), which incorporates the option to
wait to invest, and the intrinsic value (equation (7)) which does not value this option. The option
premium for each parcel is defined as: (option model price - intrinsic value)/option model price.
We present the mean option premium for each subsample (not the option premium of the
average values). Sample sizes are as given in Table VI.

| | Option Model ($) | Intrinsic Value ($) | Option Premium |
| :------------------------ | :--------------- | :------------------ | :------------- |
| **Business** | | | |
| 1977 | 30,550 | 29,090 | 0.0377 |
| 1978 | 115,092 | 112,578 | 0.0222 |
| 1979 | 84,773 | 74,998 | 0.0449 |
| **Commercial** | | | |
| 1977 | 144,237 | 136,844 | 0.0518 |
| 1978 | 180,221 | 177,735 | 0.0095 |
| 1979 | 184,477 | 171,792 | 0.0256 |
| **Industrial** | | | |
| 1977 | 146,670 | 122,124 | 0.2980 |
| 1978 | 337,196 | 291,904 | 0.1757 |
| 1979 | 147,812 | 140,696 | 0.0219 |
| **Low-density residential** | | | |
| 1977 | 90,106 | 84,603 | 0.0489 |
| 1978 | 47,207 | 43,968 | 0.1120 |
| 1979 | 51,148 | 49,192 | 0.0117 |
| **High-density residential** | | | |
| 1977 | 58,147 | 54,148 | 0.1040 |
| 1978 | 40,981 | 37,512 | 0.0586 |
| 1979 | 51,227 | 48,404 | 0.0189 |

imputations should not affect the existence of a premium for the option to
wait. However, the standard errors may be large despite the narrow confi-
dence intervals given by the variance estimates.
Finally, we perform several regressions to ascertain the comparative fit
and explanatory power of the option-pricing model. In these regressions,
errors-in-variables bias the slope coefficient downward and the intercept
upward. In Table VIII we regress theoretical prices for both the option and
intrinsic value models given in equations (6) and (7), respectively, on actual
prices, where all prices are per square foot. Both models perform fairly well
as measured by their $R^2$, although overall we reject the joint hypothesis that
the coefficient is one and the constant is zero.
In order to assess the incremental effect of the option to wait, we also run
the regressions using the observed land values as the dependent variables,
with the intrinsic values and the difference between the option model values
and the intrinsic values as independent variables (values per square foot).
The latter is a measure of the option premium, in dollar terms. Results are
presented in Table IX. The difference between $R^2$ in Table IX and those in
the right side of Table VIII represent the additional explanatory power of the

Empirical Testing of Real Option-Pricing Models
637

# Table VIII
## Regressions of per Square Foot Market Prices on Model Prices
The models are well specified if the coefficients are not significantly different from zero, and the constants are not
significantly different from one. Option model: Market Price/SF = $a + b \cdot$ Option Model Price/SF + $e$. Option model price
(equation (6)) incorporates the option to wait to invest. Intrinsic value: Market Price/SF = $a + b \cdot$ Intrinsic Value/SF + $e$.
Intrinsic value (equation (7)) does not value this option. It equals the option model price for which the variance is zero in
the limit. Sample sizes are as given in Table VI.

| | **Option Model** | | | | **Intrinsic Value** | | | |
| :------------------------ | :-------- | :-------- | :-------- | :-------- | :-------- | :-------- | :-------- | :-------- |
| | **Constant** | **Std.** | **Coeff.** | **Std.** | **R-square** | **Constant** | **Std.** | **Coeff.** | **Std.** | **R-square** |
| | **a** | **Error** | **b** | **Error** | | **a** | **Error** | **b** | **Error** | |
| **Business** | | | | | | | | | | |
| 1977 | 0.7355 | 0.0957 | 0.7814 | 0.0179 | 0.963 | 0.6609 | 0.0798 | 0.9110 | 0.0171 | 0.975 |
| 1978 | -0.5551 | 0.2962 | 1.0913 | 0.0373 | 0.932 | -0.6102 | 0.2662 | 1.1606 | 0.0354 | 0.945 |
| 1979 | 0.0919 | 0.1780 | 0.9781 | 0.0296 | 0.960 | 1.2966 | 0.1193 | 0.9666 | 0.0234 | 0.974 |
| **Commercial** | | | | | | | | | | |
| 1977 | 0.6387 | 0.0900 | 0.8234 | 0.0166 | 0.961 | 1.3372 | 0.0791 | 0.7985 | 0.0163 | 0.960 |
| 1978 | -0.8580 | 0.3470 | 1.1364 | 0.0293 | 0.945 | 0.1117 | 0.3533 | 1.0826 | 0.0304 | 0.935 |
| 1979 | 1.8306 | 0.2857 | 0.7705 | 0.0304 | 0.900 | 2.1786 | 0.3027 | 0.8182 | 0.0360 | 0.878 |
| **Industrial** | | | | | | | | | | |
| 1977 | -0.1859 | 0.1584 | 1.0786 | 0.0365 | 0.936 | 0.1157 | 0.1163 | 1.1502 | 0.0301 | 0.960 |
| 1978 | -0.4262 | 0.1212 | 1.0973 | 0.0196 | 0.987 | 0.6801 | 0.1481 | 0.9998 | 0.0255 | 0.974 |
| 1979 | 2.0889 | 0.1367 | 0.6173 | 0.0264 | 0.960 | 2.3146 | 0.1737 | 0.5993 | 0.0349 | 0.928 |
| **Low-density residential** | | | | | | | | | | |
| 1977 | -1.4781 | 0.1864 | 1.1566 | 0.0211 | 0.860 | 1.9440 | 0.1092 | 0.9131 | 0.0080 | 0.964 |
| 1978 | -0.3560 | 0.1079 | 1.0662 | 0.0128 | 0.945 | 0.1129 | 0.1103 | 1.0307 | 0.0133 | 0.938 |
| 1979 | 0.6242 | 0.0727 | 0.8807 | 0.0068 | 0.981 | 1.3223 | 0.0656 | 0.9142 | 0.0067 | 0.982 |
| **High-density residential** | | | | | | | | | | |
| 1977 | -0.5059 | 0.1200 | 1.1068 | 0.0146 | 0.963 | -0.3230 | 0.1494 | 1.1261 | 0.0189 | 0.941 |
| 1978 | 0.8254 | 0.3344 | 0.9001 | 0.0545 | 0.449 | 2.3718 | 0.2671 | 0.7261 | 0.0475 | 0.412 |
| 1979 | 1.1399 | 0.0818 | 0.7987 | 0.0103 | 0.944 | 2.6650 | 0.0762 | 0.6772 | 0.0105 | 0.921 |

638
The Journal of Finance

# Table IX
## Regressions per Square Foot
Market Price of Land Parcel/SF = $a + b \cdot$ Intrinsic Value/SF + $c$(Option Model Value/SF -
Intrinsic Value/SF). Option model price (equation (6)) incorporates the option to wait to invest.
Intrinsic value, given by intrinsic value (equation (7)) does not value this option. Sample sizes
are as given in Table VI.

| | **Constant** | **Std.** | **Coeff.** | **Std.** | **Coeff.** | **Std.** | |
| :------------------------ | :-------- | :-------- | :-------- | :-------- | :-------- | :-------- | :-------- |
| | **a** | **Error** | **b** | **Error** | **c** | **Error** | **R-square** |
| **Business** | | | | | | | |
| 1977 | 0.3412 | 0.0753 | 0.9372 | 0.01361 | 0.6993 | 0.09605 | 0.985 |
| 1978 | -0.7711 | 0.2431 | 1.1721 | 0.03203 | 0.3739 | 0.18748 | 0.956 |
| 1979 | 1.2424 | 0.4509 | 0.9700 | 0.03601 | 0.0424 | 0.34273 | 0.979 |
| **Commercial** | | | | | | | |
| 1977 | 0.4839 | 0.1730 | 0.8924 | 0.02261 | 0.7835 | 0.14528 | 0.969 |
| 1978 | -1.0618 | 0.5015 | 1.1508 | 0.03611 | 1.3296 | 0.42118 | 0.942 |
| 1979 | 1.4745 | 0.3358 | 0.8390 | 0.03356 | 0.6439 | 0.18164 | 0.898 |
| **Industrial** | | | | | | | |
| 1977 | 0.1332 | 0.0670 | 1.0705 | 0.01881 | 0.5285 | 0.04791 | 0.987 |
| 1978 | 0.3627 | 0.0746 | 0.9821 | 0.01211 | 0.6352 | 0.05281 | 0.994 |
| 1979 | 1.5415 | 0.1651 | 0.7318 | 0.03203 | 0.5581 | 0.06866 | 0.960 |
| **Low-density residential** | | | | | | | |
| 1977 | 0.5663 | 0.2016 | 0.9679 | 0.01021 | 0.6537 | 0.08228 | 0.968 |
| 1978 | -0.0838 | 0.0742 | 0.9719 | 0.00929 | 1.2678 | 0.057 | 0.972 |
| 1979 | -0.2634 | 0.1327 | 1.0217 | 0.0099 | 1.2962 | 0.09926 | 0.988 |
| **High-density residential** | | | | | | | |
| 1977 | 0.0782 | 0.1086 | 1.0093 | 0.01544 | 0.9332 | 0.06207 | 0.971 |
| 1978 | -0.0537 | 0.5213 | 0.9939 | 0.06778 | 1.5105 | 0.28259 | 0.458 |
| 1979 | 0.3955 | 0.1520 | 0.8963 | 0.01573 | 1.0843 | 0.06712 | 0.954 |

option premium, over and above the intrinsic value. We find evidence of some
contribution based on this criteria, but not generally a significant one.
If the option valuation model were a perfect description of land values the
constant would equal zero and the other coefficients would equal one. We find
that the constant is not far from zero. The intrinsic value has a coefficient
that is close to one. We also find that the coefficients for the option premium
are uniformly positive and statistically significant in all but one subsample.
While in most cases we would reject the hypothesis that the coefficient equals
one, in most subsamples it lies between 0.5 and 1.3, supporting the hypothe-
sis that the option valuation model has some explanatory power for prices,
over and above the intrinsic value.

IV. Conclusion

This paper provides evidence, based on a large sample of actual real estate
transactions, that the real option-pricing model has descriptive value. Market
prices reflect a premium for optimal development, which based on our
estimates has a mean of 6% of the land value. The basis behind the theory,

Empirical Testing of Real Option-Pricing Models
639

that the option to wait has value, appears to ring true. To the extent that it is
possible to take advantage of the optimal timing option, its value should not
be neglected. We also estimate that the annual standard deviation of individ-
ual commercial real estate asset values ranges from 18 to 28%, without
relying on time series of property prices or appraised values.
These results encourage further research in this field: using the techniques
employed here to test other real option applications, including more specula-
tive properties where we would expect the variance and option premium to be
higher. An alternative test might also examine the exercise policy of the
developer to gauge whether development did actually occur at the optimal
point predicted by the option-based model.

Appendix

We wish to solve equation (4). The solution has the form, $W(z) = Az^j + k$.
Inserting the values of $W, W'$, and $W''$ into equation (4), we obtain values
for $k$ and $j$, given in equation (5).
At the hurdle ratio, $z^*$, the value of the option is its intrinsic value, giving
the first boundary condition, $W(z^*) = Az^{*j} + k = z^* - 1$.
The second boundary condition is the smooth pasting condition, which is
based on an assumption of rational exercise, $W'(z^*) = jAz^{*j-1} = 1$.
The solutions for $z^*$ and $A$ follow.

REFERENCES

→ Brennan, Michael, 1990, Latent assets, *Journal of Finance* 45, 709-730.
→ and Eduardo Schwartz, 1985, Evaluating natural resource investment, *Journal of
Business* 58, 1135-1157.
→ Case, Karl E., and Robert J. Shiller, 1989, The efficiency of the market for single-family homes,
*American Economic Review* 79, 125-137.
→ Colwell, Peter F., 1992, Semiparametric estimates of the marginal price of floorspace (comment),
*Journal of Real Estate Finance and Economics*, Forthcoming.
→ Cox, John C., and Mark Rubinstein, 1985, *Options Markets* (Prentice-Hall, Englewood Cliffs,
N.J.).
→ Flesaker, Bjorn, 1991, Valuing European options when the terminal value of the underlying
asset is unobservable, BEBR Working Paper No. 91-0175, University of Illinois.
→ Gibson, Rajna, and Eduardo S. Schwartz, 1990, Stochastic convenience yield and the pricing of
oil contingent claims, *Journal of Finance* 45, 959-976.
→ McDonald, Robert L., and Daniel R. Siegel, 1985, Investment and the valuation of firms when
there is an option to shut down, *International Economic Review* 26, 331-349.
→ —, 1986, The value of waiting to invest, *Quarterly Journal of Economics* 100, 707-727.
→ Majd, Saman, and Robert S. Pindyck, 1987, Time to build, option value, and investment
decisions, *Journal of Financial Economics* 18, 7-27.
→ Marshall Valuation Service, 1986, Marshall and Swift, Los Angeles.
→ Milne, Frank, and Stuart Turnbull, 1991, A simple approach to interest rate option pricing,
*Review of Financial Studies* 4, 87-120.
→ Morck, Randall, Eduardo Schwartz, and David Stangeland, 1989, The valuation of forestry
resources under stochastic prices and inventories, *Journal of Financial and Quantitative
Analysis* 24, 473-488.

640
The Journal of Finance

→ Paddock, James L., Daniel R. Siegel, and James L. Smith, 1988, Option valuation of claims on
real assets: The case of offshore petroleum leases, *Quarterly Journal of Economics* 102,
479-508.
→ Rosen, Sherwin, 1974, Hedonic prices and implicit markets: Product differentiation in pure
competition, *Journal of Political Economy* 82, 34-55.
→ Rubinstein, Mark, 1976, The valuation of uncertain streams and the pricing of options, *Bell
Journal of Economics* 7, 407-425.
→ Sheik, Aamir, and Gautam Vora, 1990, The robustness of volatilities implied by the Black-Scholes
formula and using implied volatilities to infer the parameters of stock-price processes,
Working paper, Indiana University.
→ Theil, Henri, 1971, *Principles of Econometrics* (John Wiley and Sons, New York).
→ Titman, Sheridan, 1985, Urban land prices under uncertainty, *American Economic Review* 75,
505-514.
→ and Walter Torous, 1989, Valuing commercial mortgages: An empirical investigation of
the contingent-claims approach to pricing risky debt, *Journal of Finance* 44, 345-375.
→ Triantis, Alexander J., and James E. Hodder, 1990, Valuing flexibility as a complex option,
*Journal of Finance* 45, 549-566.
→ Williams, Joseph T., 1991a, Real estate development as an option, *Journal of Real Estate
Finance and Economics* 4, 191-208.
→ —, 1991b, Equilibrium and options on real assets, Working paper, University of British
Columbia.