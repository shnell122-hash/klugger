<!-- Extraccion de texto via antiword (Gemini no acepta .doc). Fuente: Chapter78-HedonicPricing082412.doc. Fidelidad menor (texto plano). -->


                                 Chapter 78
                          Hedonic Regression Models

             Ben J. Sopranzetti, Ph.D., Rutgers University, USA

                                  ABSTRACT

      This provides a basic overview of the nature and variety of hedonic
empirical pricing models that are employed in the economics literature.  It
explores the history of hedonic modeling and summarizes the field’s utility-
theory-based, microeconomic foundations.  It also provides a discussion of
and potential solutions for common problems associated with hedonic
modeling.
      The paper examines three specific, different hedonic specifications:
the linear, semi-log, and Box-Cox transformed hedonic models and applies
them to real estate data.  It also discusses recent innovations related to
hedonic models and how these models are being used in contemporary studies.


Key words: Hedonic Models, Regression, Real Estate, Box-Cox, Pricing, Price
Indexes, Semi-Log, Least Squares, Housing, Property
                          Hedonic Regression Models


1. INTRODUCTION
      Hedonic modeling first originated as a method for valuing the demand
and the price of farm land.[1]  Although Court (1939) is widely considered
to be the father of hedonic modeling, his paper had nothing to do with real
estate; instead, Court created a hedonic pricing index for automobiles.
Regardless of how they are used, hedonic regressions deconstruct the price
of an asset into the asset’s component parts, and then use some form of
ordinary least squares regression analysis to examine how each individual
piece uniquely contributes to the item’s overall value.
      The consumer price index is probably the most famous example of the
use of hedonic regressions as a control mechanism for differences in the
quality of products over time.  The consumer price index measures the
change over time in the price of a bundle of goods.  But, if the quality of
the goods in the bundle changes over time, then one can imagine that
obtaining a high quality prediction of the value of the index at some
future point in time can be problematical.  For example, imagine trying to
predict the price of an automobile today, based upon pricing information
from the 1963.  A Chevrolet Corvette costs substantially more money today
that it did back in 1963.  Some of the increase in the car’s price is due
to inflation, but another part of the price increase is because Corvettes
are far safer, faster, and lighter today than they were back then.
Corvettes nowadays enjoy a vast technical superiority over their vintage
forbearers.  The technical improvements clearly add value.  As we will see
below, they add “hedonic utility”.  So when trying to predict the price of
a new Corvette with a turbo-charged engine, air conditioning, 6-speed
transmission, airbags, and a sport tuned suspension, one cannot examine the
simple inflationary price increase of a Corvette, but in addition one must
examine the price increases of the additional individual improvements.
      Although the consumer price index might arguably be the most famous
use of hedonic modeling techniques, hedonic pricing models are also widely
utilized to price other items, such as electronics, clothing and, in
particular, real estate (the focus of this paper), where they are most
often utilized to correct for the heterogeneity among properties and
houses.  Since each house has idiosyncratic characteristics that make it
unique, estimating demand or prices from real estate data can be
challenging.  Rather than pricing a given house or property directly, a
researcher can deconstruct the house and property into their value-adding
components, such as lot size, square feet, number of bathroom, number of
bedrooms, neighborhood quality, etc.  A well-specified hedonic model will
estimate the contribution to the total price of each of these features
separately.  If it is the price that is estimated, then the hedonic model
is called an “additive” model.  If, instead, the elasticity is estimated,
then it is called a “log” model.    This short primer will explore in some
detail the nature and variety of hedonic pricing models, and should provide
a solid foundation for any researcher interested in employing this widely-
utilized empirical technique.
2 THE THEORETICAL FOUNDATION
      Although many empirical papers using hedonic modeling techniques were
published in the years that followed Court’s work, Lancaster's (1966)
seminal paper is the first attempt to create a theoretical foundation for
hedonic modeling.  To this end, Lancaster presented a groundbreaking theory
of hedonic utility.  Lancaster's argues that it is not necessarily a good
itself that creates utility, but instead the individual “characteristics”
of a good that create utility. Specifically, an item’s utility is simply
the aggregated utility of the individual utility of each of its
characteristics.  For example, the utility that comes from owning an
expensive car comes not so much from the car itself, but from the fact that
it provides not only transportation, but also fast acceleration, enhanced
safety, attractive styling, increased prestige, etc.  Furthermore, he
argues that items can be arranged into groups based on the characteristics
they contain. Consumers make their purchasing decisions within a group
based on the number of characteristics a good possesses per unit cost.  For
example, people make their home purchase decisions based upon the number of
bedroom, number of bathrooms, etc.
      Although Lancaster is the first to discuss hedonic utility, he says
nothing about pricing or pricing models.  Rosen’s (1974) is the first to
present a theory of hedonic pricing.  Rosen argues that an item can be
valued as the sum of its utility generating characteristics; that is, an
item’s total price should be the sum of the individual prices of its
characteristics.  This implies that an item’s price can be can be regressed
upon the characteristics to determine the way in which each characteristic
uniquely contributes to the price.  Although Rosen did not formally present
a functional form for the hedonic pricing function, his model clearly
implies a nonlinear pricing structure.
       For a more thorough review of the extant literature please see the
excellent surveys by Follain and Jimenez (1985) and Sheppard (1999).
3  THE DATA
      The data are 7088 observations of real estate transactions of
properties that are located in the Klein School District, of suburban
Houston, between January 1, 1992 and December 31, 1995.  The data set
provides information on property, home, and transaction characteristics.
Property characteristics include the lot size in square feet, distance to
the central business district, and information on neighborhood sub-markets
within the overall Klein area.  Home characteristics include the size of
the house in square feet, year built, number of bathrooms, number of
bedrooms, a dummy variable for the existence of a pool, and whether the
house has any known defects.  Transaction characteristics include the list
price, the transaction price, the list date, the number of days that the
property remained on the market prior to being sold, whether the property
is sold “as is”, whether the home was sold by a financial institution that
had previously foreclosed on the property, and the identity of the listing
and selling real estate brokers.
      Out of the initial 7088 observations, 146 observations are deleted
due to missing or obviously incorrect data.   In addition, several screens
are employed to increase the homogeneity of the properties in our sample
and to eliminate observations in which data may not have been entered
correctly.  Properties are omitted if their:
      1.    age exceeds 30 years old (24 observations);
      2.    lot size is smaller than 5,000 or larger than 50,000 square
feet (165 observations);
      3.    living space exceeds 4,000 square feet (362 observations); and
      4.    number of bathrooms (full and half) exceeds six (six
observations).
The final sample includes 6385 observations.  Table 75.1 includes the
summary statistics for the dependent variables.
                       Table 75.1.  Summary statistics
|NAME      |MEAN  |ST. DEV|MINIMUM   |MAXIMUM   |
|SALE      |98114 |44438  |18000     |385000    |
|FT        |2250  |668    |819       |3994      |
|AGE       |12.60 |5.90   |0         |28        |
|LOT       |9563  |3972   |5000      |49933     |
|BED       |3.63  |0.60   |1         |6         |
|BATH      |2.22  |0.44   |1         |5.1       |
|POOL      |0.14  |0.35   |0         |1         |
|FC        |0.05  |0.21   |0         |1         |
|ASIS      |0.01  |0.12   |0         |1         |
|D1DUMMY   |0.03  |0.16   |0         |1         |
|CBD       |20.26 |3.50   |10.61     |28.86     |
|NEW       |0.02  |0.13   |0         |1         |
|SUMMER    |0.41  |0.49   |0         |1         |

4  THE LINEAR MODEL
      The basic additive hedonic equation is one where the value of an asset
is regressed against the characteristics that determine its value.   This
linear model is appropriate when there are heterogeneous products and
heterogeneous buyers and the heterogeneous items to be valued can be easily
replaced/restocked once they have been purchased, i.e., there is a
continuous, uninterrupted supply of the item to be priced.  In this case,
the pricing model of the item is very simply the sum of the prices of its
component parts, where
Value = f(S,N,L,C,T)
Where
S represents the structural characteristics of the home and property, e.g.
square footage, property size, number of bedrooms, etc.
N represents the neighborhood characteristics
L represents the location within a giving market
C represents the contract conditions, e.g. is the property sold as is, is
there a condo fee, etc.
And
T represents the date or time that the transaction price is observed
For ease of notation, we allow the matrix X to represent the combination of
the individual vectors S, N, L, C, and T
(75.1)      [pic]
Thus an item’s expected price is the characteristics X times (, where (
represents a vector of marginal prices.
5  EMPIRICAL SPECIFICATION
5A  THE DEPENDENT VARIABLE
      In real estate modeling, it is common to use the most recent
transaction price as a dependent variable.  There are also studies use rent
as the dependent variable, but rents are problematical since different
apartments may have different terms in the rental agreement; for example,
some might include heat and hot water or parking.  One way of dealing with
the “rent” problem is to obtain the cost of utilities (or parking) for
properties where the utilities are not included in the rental agreement,
and add these costs to the base rental price to get an adjusted rental
price.  Another possibility is to use the actual rental price as a
dependent variable and then add a dummy independent variable that equals
one if the unit includes utilities or parking and zero otherwise.  Using
actual transaction prices circumvents these problems, but exposes the
researcher to another the problem that current transactions may not be
representative of the total housing stock: a selection bias.
5B INDEPENDENT VARIABLES
      One of the principal criticisms of the hedonic modeling of real
estate prices is the severity of the omitted variable problem: the
coefficient estimates are often not robust to changes in the model’s
specification.  This implies that researchers must be very careful when
interpreting the coefficients of a hedonic regression.   A sampling of
recent hedonic real estate models yields the following common dependent
variables:
Structural characteristics of the home and property:  square footage of the
unit, square footage of the property, total number of rooms, total number
of bedrooms, total number of bathrooms, the existence of a pool, any known
defects, structural type (single family, duplex, condominium, etc.), age,
air conditioning, finished basement, fireplaces, garages, etc.
Neighborhood characteristics: quality of the school system, quality of the
neighborhood, median salary.
Location within a giving market: distance from the central business
district, proximity to a train station, distance to supermarket, distance
to schools, flooding area.
Contract Conditions:  Was the property sold as is? Was it a foreclosure?
For a more complete discussion of the potential explanatory variables,
please see Hocking (1976), Leamer (1978) and Amemiya (1980)
5C  EXAMPLE USING THE LINEAR MODEL
      Table 75.2 present the results of a linear hedonic pricing model
where the dependent variable is the property’s transaction price. The
independent variables include the square footage of the home and it square,
the age of the home and its square, the size of the lot and its square, the
number of bedrooms and its square, dummy variables representing the number
of bathrooms, the proximity in miles to the central business district, a
dummy variable for a pool, foreclosure, sold as is, if there are defects,
if the home is brand new, and if the property was listed in the summer.
Table 75.2  OLS regression of transaction price on the independent
variables.
|OLS SALE                      |
|           |Coefficie|T-stat |
|           |nt       |       |
|FT         |0.94591  |10.33  |
|SQFT       |-8.65E-04|-15.35 |
|AGE        |-3035.3  |-20.71 |
|SQAGE      |59.356   |10.25  |
|LOT        |1.7881   |10.01  |
|SQLOT      |-1.62E-05|-3.59  |
|BED        |42839    |11.40  |
|SQBED      |-6207.4  |-12.35 |
|BATH 2     |6305.7   |2.11   |
|BATH 3     |4199.3   |5.82   |
|BATH 4     |15936    |17.26  |
|BATH 5     |16196    |6.26   |
|POOL       |11447    |16.85  |
|FORECLOSE  |-10025   |-9.03  |
|ASIS       |-11932   |-6.21  |
|DEFECT     |-383.98  |-0.28  |
|CBD        |267.98   |4.12   |
|NEW        |3004.3   |1.60   |
|SUMMER     |1260.8   |2.81   |
|CONSTANT   |-17355   |-2.78  |
|R2         |84.3%    |       |


      The results of the hedonic regression will likely not be surprising to
anyone that has ever shopped for a home.  The hedonic model has parceled
out the value of the home/property into its component parts and has
succeeded in explaining 84.3% of the value of transaction price.  The
relationship between real estate transaction prices and the square footage
of the home is concave; for small homes small increases in size have a
larger marginal impact than for larger homes.   The same is true for the
square footage of the property and the bedrooms.  The relationship between
transaction price and age is convex; implying that the market price of
young houses depreciates at a larger rate than that of older houses.  It is
not surprising that given the hot summers in Texas, a pool adds substantial
value (in this case $11,447 of value), nor is it surprising that foreclosed
upon properties and properties that are sold as-is tend to sell for less
money than other properties.  Properties farther from the central business
district also tend to sell for higher prices.  Interestingly, properties
listed in the summer tend to sell for on average $1,260 higher prices than
those not listed in the summer.
      The principal use of a linear hedonic model is to help researchers
construct a property’s transaction price from its component parts.  So,
using the above model, a three year old, 1800 square foot home, with a
200ft by 200ft lot, three bedrooms and two baths, with a pool, sold at a
foreclosure sale, with no known defects, that is located seven miles from
the central business district, and listed in the summertime would have a
predicted transaction price of $102,092.
6  THE SEMI-LOG MODEL
      When the item to be priced cannot be easily restocked, for example, a
home, then non-linearities arise in the hedonic pricing structure.  To deal
with this, it is common for researchers to employ the following semi-
logarithmic functional form for the hedonic model
(75.2)      [pic]
thus
(75.3)      [pic]
In this case, an the log of an item’s expected price is the sum of its
characteristics X times (, and the marginal price of each individual
attribute x is
(75.4)      [pic]

Where x is the current level of the characteristic and b is the regression
coefficient.  Notice that the semi-log form implies that the price of a
given characteristic varies with its level, i.e. the prices are non-linear.

      The semi-log structural hedonic pricing model has several advantages
over its linear counterpart.  The principal advantage is that it permits
the value of a given characteristic (the number of bathrooms, for example)
to vary proportionately with the value of other characteristics (the number
of bedrooms).  This is not the case with a linear model, where a second
bathroom adds the same value to a house that has one bedroom as it does to
one that has five bedrooms.
6A  EXAMPLE USING THE SEMI-LOG MODEL
      Table 75.3 present the results of a linear hedonic pricing model
where the dependent variable is the log of the property’s transaction
price.  Again, the results are not surprising.   An advantage of the semi-
log form is that the model’s coefficients are easily interpreted.  The
percentage change in the value of the house for a unit change in the
dependent variable can be represented as [pic], where b is the regression
coefficient[2].   For example, if the coefficient on the variable that
represents a pool equals 0.104, then adding a pool to a house would
increase its value by [pic]
Table 75.3  OLS regression of LOGSALE on the dependent variables.
|OLS LOGSALE                 |
|Coefficient|T-stat   |      |
|FT         |6.76E-04 |28.68 |
|SQFT       |-5.57E-08|-11.89|
|AGE        |-2.50E-02|-20.48|
|SQAGE      |4.33E-04 |8.98  |
|LOT        |2.02E-05 |13.62 |
|SQLOT      |-2.70E-10|-7.17 |
|BED        |0.3214   |10.28 |
|SQBED      |-4.46E-02|-10.66|
|BATH 2     |1.29E-02 |0.52  |
|BATH 3     |5.32E-02 |8.86  |
|BATH 4     |0.11094  |14.44 |
|BATH 5     |9.35E-02 |4.35  |
|POOL       |0.10416  |18.43 |
|FORECLOSE  |-0.13635 |-14.77|
|ASIS       |-0.18429 |-11.52|
|DEFECT     |-9.26E-03|-0.81 |
|CBD        |4.17E-03 |7.71  |
|NEW        |-2.02E-02|-1.29 |
|SUMMER     |1.38E-02 |3.69  |
|CONSTANT   |9.5387   |183.40|
|R2         |87.5%    |      |


7  THE BOX-COX MODEL
      Although not as widely employed due to the difficulty of interpreting
the coefficients, a more general form of the hedonic pricing model was
first presented by Halvorsen and Pollakowski (1981), which applies the
seminal work of Box and Cox (1964) to hedonic modeling.  The basic Box-Cox
transformation is
(75.5)      [pic],           if [pic]
                  [pic],          if [pic]
So the basic form of the Box-Cox model is given by
(75.6)      [pic]
Please see the Appendix for a discussion of how the Box-Cox coefficients
are estimated. Notice that when ( equals one the Box-Cox structural form
reduces to the linear form.   A more general form of the Box-Cox model can
be expressed by
(75.7)      [pic]
In this case, when ( and ( are both equal to one and the cross-products (jk
are all zero, then Equation (75.7) reduces down to a simple linear
regression model.  When ( and ( are both equal to zero and the cross-
product (jk are all also equal to zero, then the model reduces down to a
straightforward log-log functional form.
      The Box-Cox model was first introduced into the mainstream finance
literature by C.F. Lee in his seminal 1976 paper, which examines the
Functional Form and the Dividend Effect of the Electric Utility Industry.
Other excellent examples of the application of the Box-Cox model to finance
include Lee and Kau (1976) and Lee, Fabozzi and Francis (1980).
      One of the most innovative uses of Box-Cox hedonic models in real
estate have been to back out property depreciation rates for federal tax
reasons.  Hulten and Wycoff (1981) present evidence of a constant geometric
rate derived from a hedonic model with a Box--Cox Transformation of the
value industrial and commercial buildings.  The more flexible Box-Cox
approach permits relationships to emerge instead of forcing a
predetermined, and perhaps ad hoc, functional form.
7A  EXAMPLE USING THE BOX-COX MODEL
      Table 75.4 present the results of a linear hedonic pricing model
where the dependent variable is the a Box-Cox transformation of the
property’s transaction price.  Notice that lambda emerges from the model
and is not exogenously imposed.
Table 75.4  Box-Cox regression the transaction price on the dependent
variables.
|Box Sale                   |
|Coefficient|T-stat  |      |
|FT         |2.35E-04|31.29 |
|SQFT       |-2.19E-0|-14.67|
|           |8       |      |
|AGE        |-7.82E-0|-20.13|
|           |3       |      |
|SQAGE      |1.34E-04|8.71  |
|LOT        |6.49E-06|13.69 |
|SQLOT      |-8.79E-1|-7.33 |
|           |1       |      |
|BED        |0.10082 |10.12 |
|SQBED      |-1.39E-0|-10.43|
|           |2       |      |
|BATH 2     |8.94E-03|1.13  |
|BATH 3     |1.70E-02|8.87  |
|BATH 4     |3.37E-02|13.76 |
|BATH 5     |2.86E-02|4.17  |
|POOL       |3.28E-02|18.21 |
|FORECLOSE  |-4.49E-0|-15.26|
|           |2       |      |
|ASIS       |-6.17E-0|-12.10|
|           |2       |      |
|DEFECT     |-3.08E-0|-0.85 |
|           |3       |      |
|CBD        |1.39E-03|8.05  |
|NEW        |-7.83E-0|-1.57 |
|           |3       |      |
|SUMMER     |4.40E-03|3.69  |
|CONSTANT   |6.1796  |372.70|
|           |R2      |87.5% |
|           |λ       |-0.100|


8  PROBLEMS WITH HEDONIC MODELING

8A  THE IDENTIFICATION PROBLEM
      There is an inherent identification problem that occurs when one
attempts to model an item’s demand function when the prices that one has to
work with come from the interaction of the item’s supply and demand
functions: it is difficult to separate out the supply and demand impact on
price.  There is a second problem with hedonic modeling that comes from the
non-linear nature of the pricing structure.  In a simple demand model, the
price of an item is taken as given and consumers make their purchase
decision (quantity) based upon the exogenous price; i.e. consumers are
price-takers.   But, as seen above, non-linear hedonic models imply that
the price of a characteristic is correlated with quantity; so consequently,
buyers will select not only the quantity of a characteristic but, by
design, also its price.   Several authors, Blomquist and Worley (1982) or
Diamond and Smith (1985), have attempted to solve this problem through the
use of instrumental variables.
8B  THE EQUILIBRIUM PRICING PROBLEM

      A key aspect of demand modeling is that observed prices are assumed to
be equilibrium prices.  Unfortunately, in markets such as real estate where
adjustment costs can be large, the notion of observed prices being
equilibrium ones becomes problematical.   There are several papers that
attempt to deal with the disequilibrium character of real estate
transaction prices.   See Maclennan (1977) and (1982) for a good overview
of the disequilibrium problem.
      There are several ways in which researches have attempted to deal with
the disequilibrium problem.  Bowden (1978) addresses the problem by
utilizing only those observations that are either at or near equilibrium.
He employs a switching regression technique.  See Anas and Eum (1984) for
an application of this “disequilibrium” hedonic modeling technique.
Although switching regression models can be effective at mitigating the
disequilibrium problem, they are not without their challenges.  The major
problem is how to differentiate between equilibrium and disequilibrium
prices.   Another problem is that modelers are often more interested in
predicting actual future transaction prices rather that so called
equilibrium prices.
      Another way to deal with the disequilibrium problem is to find a way
to adjust prices back to their equilibrium levels.  There are several
papers that use this technique.[3]  The technique involves estimating a
time series index of prices, then finding a way to determine which prices
are equilibrium ones (for example, prices may be deemed to be near their
equilibrium values if there was little or no price change from period to
period).  Take this set of equilibrium prices and estimate their
determining characteristics, so that for each period there is an actual
price, and estimated index price, and an estimated equilibrium price.  From
these prices it is possible to determine the extent to which the price is
out of equilibrium.  The last step is to find the determinants of the
disequilibrium and adjust the initial prices accordingly.
9  RECENT DEVELOPMENTS
      There have been some interesting recent developments in the area of
hedonic modeling.  Below is a brief synopsis of a few recent papers and
issues that are on the cutting-edge of the literature.  Costanigro,
McCluskey and Mittelhamme (2007) argue that when researchers disregard
heterogeneity across assets they introduce an aggregation bias into their
estimated prices.   They suggest that a model that estimates hedonic
functions that are specific to price ranges yields more accurate
predictions.   Collins, Scorcu, and Zanola (2007) examine a similar
uniqueness problem, but with respect to art rather than wine.
      Goetzmann and Peng (2006) analyze and present a model that adjusts for
the bias that occurs because of a house seller’s reservation price in
transaction-based hedonic price indices. They present a hedonic model where
the ratio of sellers' reservation prices to the actual market value has an
impact on trading volume and can lead to a bias in the observed transaction
prices.  They find that when there is an upward bias to index returns when
trading volume decreases.
      Diewert (2002) and Feenstra and Knittel (2004) examine the problem of
quality adjustments in a hedonic model.  These papers examine whether the
output price index for a durable good can also be used as (partial) input
price index.  Although these papers focus on the producer price index, the
quality adjustments can be applied more widely. The authors find that the
relevant input price is the value of the characteristics bundle of the
underlying asset (i.e., the market price) divided by the quantity of the
individual characteristics associated with the bundle.  For example, if one
were to buy a cleaning service, one would take the price of the cleaning
service divided by the total number of benefits provided by the service
(e.g., the time savings, the convenience, the trustworthiness, the quality
of the work, etc.)
      Bajari and Benkard re-examine hedonic models of demand for
differentiated products. They nicely generalize Rosen's original hedonic
model to allow for unobservable product characteristics and for the hedonic
pricing function to have a nonseparable form. They use a semi-parametric
approach demonstrate that if there are only a few products, once can
construct bounds on an individual’s utility parameters, an in addition
other important considerations, for example, aggregate demand and consumer
surplus.[4]  Heckman, Matzkin and Nesheim (2010) examine nonaddative
hedonic models.  In specific, they examine the issue of nonparametric
identification and estimation of these models.
      Recently, hedonic models have been employed examine issues of
substantial political importance.  Sander and Polasky (2009), Poudyal,
Hodges, and Merrett (2009), Hoshino and Kuriyama (2010), Cutter, Fernandez,
Sharma, and Scott (2011), Brander and Loeste (2011), and Nordman and Wagner
(2012) all provide evidence on the high value of wide open spaces in the
United States.  Jiao and Liu (2010) examines this same issue in Wuhan,
China.  Donovan and Butry (2010) examine a related issue: the value of
trees that line city streets. Gopalakrishnan,  Smith, Slott, and Murray
(2011) examine the value of disappearing beaches due to beach erosion.
Kim, Cho, Lambert, and Roberts (2010) and Bayer, Koehane, and Timmons
(2009) utilize hedonic models to measure the value of air quality.  Lastly,
Bishop and Murphy (2011) have an innovative paper that utilized a dynamic
hedonic model to estimate the willingness to pay in order to avoid violent
crime.
      Hedonic regressions are being increasingly used to better understand
the drivers of prices for consumer products.  Costanigro, McCluskey and
Mittelhamme (2007), Costanigro, Mittelhamme, and McCluskey (2009) and
Panzone (2011) have utilized hedonic models to examine fluctuations in wine
prices.  Thane (2009) uses a hedonic model to determine whether sensory or
objective attributes drive wine prices.  Benfratello, Piacenza, and
Sacchetto (2009) examine the issue of taste versus reputation. Kassie,
Abdulai, and Wollny (2011) utilize a hedonic model to examine the prices of
cattle.
10  SUMMARY
      This short primer provides an overview of the literature and the
microeconomic theory that underpins modern hedonic pricing models.   At
their most basic, hedonic pricing models deconstruct an asset’s price into
the price of the asset’s individual component parts, and then use some form
of ordinary least squares regression analysis, using either a linear, semi-
log, or Box-Cox structural form, to examine how each individual component
part uniquely contributes to the item’s overall value.   This paper
explores each of these aforementioned structural forms and their associated
problems, and in addition offers some guidance on common treatments of the
dependent and independent variables.
                                Bibliography
Abraham, Jesse M. and Patric H. Hendershott,  “Bubbles”, Journal of Housing
Research”, 7(2), 1996, pp. 191-208.

Amemiya, Takeshi, “Selection of Regressors”, International Economic  Review,
21, 1980, pp. 331-54.

Anas, Alex and S.J. Eum, “Hedonic Analysis of a Housing Market in
Disequilibrium”, Journal of Urban Economics, 15, 1984.

Bajari, Patrick and C. Lanier Benkard, “Demand Estimation with
Heterogeneous Consumers and Unobserved Product Characteristics: A Hedonic
Approach,”
Journal of Political Economy, 2005, vol. 113, no. 6.


Patrick Bayer, Fernando Ferreira, and Robert McMillan. (2007) A Unified
Framework for Measuring Preferences for Schools and Neighborhoods. Journal
of Political Economy 115:4, 588-638

Bayer, P., N. Keohane, and C. Timmins, “Migration and hedonic valuation:
The case of air quality, Journal of Environmental Economics and Management,
Volume 58, Issue 1, July 2009, Pages 1–14

Benfratello, L, M. Piacenza, and S. Sacchetto, “Taste or reputation: what
drives market prices in the wine industry? Estimation of a hedonic model
for Italian premium wines,” Applied Economics, Volume 41, Issue 17, 2009,
2197-2209

Bishop, K. and A. Murphy,  “Estimating the Willingness to Pay to Avoid
Violent Crime: A Dynamic Approach, The American Economic Review, Volume
101, Number 3, May 2011 , pp. 625-629


Blomquist, Glenn and Lawrence Worley, “Specifying the Demand for Housing
Characteristics: The Exogeniety Issue”, In D.B. Diamond and G. Tolley
(eds.), The Economics of Urban Amenities, Academic Press, 1982.

Bowden, Roger J. The Econometrics of Disequilibrium. North Holland, 1978.

Box, G.E.P. and D. Cox, An Analysis of Transformations”, Journal of the
American Statistical Association, Society Series B, 26, 1964, pp. 211-52.

Bontemps, Christophe, Michel Simioni, and Yves Surry. “Semiparametric
Hedonic Price Models: Assessing The Effects Of Agricultural Nonpoint Source
Pollution,” Journal of Applied Econometrics 2008, 23:6, 825-842

Brander, L.,  and M. Koeste, “The value of urban open space: Meta-analyses
of contingent valuation and hedonic pricing results,” Journal of
Environmental Management, Volume 92, Issue 10, October 2011, Pages
2763–2773


Collins, A. A.E. Scorcu, R.Zanola, “Sample Selection Bias and Time
Instability of Hedonic Art Price Indexes, Quaderni – 2007, Working Papers
DSE N° 610

Costanigro, Marco , Jill J. McCluskey and Ron C. Mittelhammer, “Segmenting
the Wine Market Based on Price: Hedonic Regression when Different Prices
mean Different Products,” Journal of Agricultural Economics, 2007, Volume
58 Issue 3, Pages 454 – 466

Costanigro, M., R. Mittelhammer, and J. McCluskey, “Estimating class-
specific parametric models under class uncertainty: local polynomial
regression clustering in an hedonic analysis of wine markets,” Journal of
Applied Econometrics, Volume 24, Issue 7, pages 1117–1135,
November/December 2009

Court, A.T. “Hedonic Price Indexes With Automotive Examples”, The Dynamics
of Automobile Demand, New York, General Motors, 1939.

Cutter, B., L. Fernandez, R. Sharma, and T. Scott, “Dynamic Analysis Of
Open Space Value Using A Repeat Sales/Hedonic Approach,” Working Paper
University of Oregon 2011.


Diamond, Douglas B. Jr. and Barton Smith, “Simultaneity in the Market for
Housing Characteristics”, Journal of Urban Economics, 17, 1985, pp. 280-92.


Diewert, W. E. (2002), Hedonic Producer Price Indexes and Quality
Adjustment,
Discussion Paper No.: 02-14, University of British Columbia, Vancouver



Donovan, G. and D. Butry, “Trees in the city: Valuing street trees in
Portland, Oregon,” Landscape and Urban Planning, Volume 94, Issue 2, 28
February 2010, Pages 77–83


Dreiman, Michelle and James R. Follain, “Drawing Inferences about Housing
Supply Elasticity from House Price Responses to Income Shocks”, Freddie
Mac, Processed, 2000.

Epple, Dennis, Richard Romano, and Holger Sieg, “Admission, Tuition, and
Financial Aid Policies in the Market for Higher Education,” Econometrica,
2006, 74:4, 885-928

Feenstra, Robert C. and Knittel, Christopher R.,Re-Assessing the U.S.
Quality Adjustment to Computer Prices: The Role of Durability and Changing
Software(October 2004). NBER Working Paper No. W10857

Follain, James R. and Emmanuel Jimenez, “Estimating the Demand for Housing
Characteristics: A Survey and Critique”, Regional Science and Urban
Economics, 15(1), 1985, pp. 77-107.

Goetzmann, William and Liang Peng, “Estimating House Price Indexes in the
Presence of Seller Reservation Prices,” Review of Economics and Statistics,
2006, Vol. 88, No. 1, Pages 100-112

Gopalakrishnan, S., M. Smith, J. Slott, and A. Murray,”The value of
disappearing beaches: A hedonic pricing model with endogenous beach width,”
Journal of Environmental Economics and Management, Volume 61, Issue 3, May
2011, Pages 297–310


Haas, G.C. “Sales Prices as a Basis for Farm Land Appraisal”, Technical
Bulletin 9, St. Paul: The University of Minnesota Agricultural Experiment
Station, 1922.

Hahn, William F., and Kenneth H. Mathews. (2007) Characteristics and
hedonic pricing of differentiated beef demands. Agricultural Economics
36:3, 377-393

Halvorsen, Robert and Raymond Palmquist, “The Interpretation of Dummy
Variables in Semilogrithmic Regressions”, American Economic Review, 70,
June 1980, pp. 474-5.

Halverson, Robert and Henry O. Pollakowski, “Choice of Functional Form
Equations”, Journal of Urban Economics, 10(1), July 1981, pp. 37-49.

Heckman, J., R. Matzkin, and L. Nesheim, “Nonparametric Identification and
Estimation of Nonadditive Hedonic Models, Econometrica, Volume 78, Issue 5,
September 2010 pages 1569–1591


Hocking,  R.R.  “The  Analysis  and  Selection  of   Variables   in   Linear
Regression”, Biometrics, 32, March 1976, pp. 1-49.

Hoshino, T. and K. Kuriyama, “Measuring the Benefits of Neighbourhood Park
Amenities: Application and Comparison of Spatial Hedonic Approaches,”
Environmental and Resource Economics, Volume 45, Number 3 (2010), 429-444


Hulton, Charles; Wycoff, Frank. “The Measurement Of Economic Depretiation,”
In: HULTEN, Charles (Ed.). Depretiation, Inflation, And The
Taxation Of Income From Capital, Washington: Urban Institute Book, 1981.

Jensen, Paul H. and Elizabeth Webster, “Labelling Characteristics And
Demand For Retail Grocery Products In Australia,” Australian Economic
Papers 2007, 47:2, 129-140

Jiao, L and Y. Liu, “Geographic Field Model based hedonic valuation of
urban open spaces in Wuhan, China”, Landscape and Urban Planning, Volume
98, Issue 1, 30 October 2010, Pages 47–55

Kassie, G., A. Abdulai, and C Wollny, “Heteroscedastic hedonic price model
for cattle in the rural markets of central Ethiopia,” Applied Economics,
Volume 43, Issue 24, 2011, 3459-3464

Kim, S.G., S.H. Cho, D. Lambert, and R. Roberts, “Measuring the value of
air quality: application of the spatial hedonic model,” Air Quality,
Atmosphere & Health, Volume 3, Number 1 (2010), 41-51

Lancaster, Kelvin J. “A New Approach to Consumer Theory,” Journal of
Political Economy, 74, 1966, pp. 132-57.

Leamer,  Edward  E.  Specification   Searches:   Ad   Hoc   Inference   With
Nonexperimental Data. Wiley, 1978.

Lee, Cheng Few,  "Functional Form and the Dividend Effect of the Electric
Utility Industry," Journal of Finance, December, 1976.
 
Lee, Cheng Few and James B Kau, "The Functional Form in Estimating the
Density Gradient:  An Empirical Investigation,", Journal of American
Statistical Association, June, 1976.

Lee, Cheng Few, Frank J. Fabozzi and Jack C. Francis, "Generalized
Functional Form
for Mutual Fund Returns”, Journal of Financial and Quantitative Analysis,
December 1980.


Maclennan, Duncan, “Some Thoughts on the Nature and Purpose of Hedonic
Price Functions”, Urban Studies, 14, 1977, pp. 59-71.

Maclennan, Duncan. Housing Economics. London: Longman, 1982.

Stephen Malpezzi, "A Simple Error Correction Model of House Prices,"
Wisconsin-Madison CULER working papers 98-11, University of Wisconsin
Center for Urban Land Economic Research, 1998.

Nordman, E. and J. Wagner. "Public purchases and private preferences:
Challenges for analyzing public open space acquisitions" Urban Forestry &
Urban Greening ,11.2 (2012): 179-186.

Panzone, L. "The lost scent of Eastern European wines in Western Europe: A
hedonic model applied to the UK market", British Food Journal, Vol. 113
Iss: 8, 2011, pp.1060 – 1078

“Poudyal, N., D. Hodges, C. Merrett, “A hedonic analysis of the demand for
and benefits of urban recreation parks,” Land Use Policy, Volume 26, Issue
4, October 2009, Pages 975–983


Rosen, Sherwin, “Hedonic Prices and Implicit Markets: Product
Differentiation in Pure Competition”, Journal of Political Economy, 82(1),
January/February 1974, pp. 34-55.

Sander, H. and S. Polasky, “The value of views and open space: Estimates
from a hedonic pricing model for Ramsey County, Minnesota, USA,” Land Use
Policy, Volume 26, Issue 3, July 2009, Pages 837–845


Sheppard, Stephen, “Hedonic Analysis of Housing Markets”, In Paul C.
Chesire and Edwin S. Mills (eds.), Handbook of Regional and Urban
Economics, volume 3. Elsevier, 1999.

Thrane, C. “Explaining Variation In Wine Prices: The Battle Between
Objective And Sensory Attributes Revisited,” Applied Economics Letters,
Volume 16, Issue 13, 2009, 1383-1386

Wallace, H.A. “Comparative Farmland Values in Iowa”, Journal of Land and
Public Utility Economics, 2, October 1926, pp. 385-92.


APPENDIX


      This appendix describes the maximum likelihood technique used for the
estimation of the nonlinear parameters of the Box-Cox transformation. Given
the functional form specified in Equations 75.5, 75.6, and 75.7, and
employing the assumption that there is some ( for which the error term in
75.6 has an approximate normal distribution with mean of zero and a
variance of [pic], then for the nth observation the density function can be
represented as
A.1 [pic], where [pic]
If [pic]is linear, that is [pic], and [pic], then the density function
transforms into something more tractable.
A. 2 [pic]
Next, in order to get the density function for y rather than z, we must
multiply the density function for z by its Jacobian.  If we do so, then we
obtain
A. 3 [pic], the corresponding log-likelihood function of which is
delineated as
A. 4 [pic]
Now that we have the log of the likelihood function, the values of the
parameters (, (, and ( are determined by maximum likelihood estimation.
-----------------------
[1] Hass (1922) and Wallace (1926) both use hedonic-style models to value
farmland in the Midwestern United States.
[2] See Halvorsen and Palmquist (1980)
[3] See Abraham and Hendershott (1996), Malpezzi (1998) and Drieman and
Follain (2000)
[4] Please see Bontemps, Simioni, Surry (2008), Jensen and Webster (2008)
Ferreira and McMillan. (2007), Hahn and Mathews (2007) and Epple, Romano,
and Sieg (2006) for additional work on this interesting theme.


